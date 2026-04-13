package com.pisito.app.service;

import com.pisito.app.controller.dto.entry.CreateEntryResourceRequest;
import com.pisito.app.controller.dto.entry.CreateNoteRequest;
import com.pisito.app.controller.dto.entry.EntryResponse;
import com.pisito.app.controller.dto.entry.UpdateEntryRequest;
import com.pisito.app.controller.dto.resource.CreateLinkResourceRequest;
import com.pisito.app.controller.dto.resource.CreateMediaResourceRequest;
import com.pisito.app.controller.dto.resource.CreateTextResourceRequest;
import com.pisito.app.controller.dto.resource.ResourceResponse;
import com.pisito.app.controller.dto.resource.UpdateTextResourceRequest;
import com.pisito.app.controller.dto.tag.TagResponse;
import com.pisito.app.model.User;
import com.pisito.app.model.Entry;
import com.pisito.app.model.FlagEnum;
import com.pisito.app.model.LinkResource;
import com.pisito.app.model.MediaResource;
import com.pisito.app.model.Resource;
import com.pisito.app.model.ResourceType;
import com.pisito.app.model.Tag;
import com.pisito.app.model.TextResource;
import com.pisito.app.repository.EntryRepository;
import com.pisito.app.repository.ResourceRepository;
import com.pisito.app.repository.TagRepository;
import com.pisito.app.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class EntryService {

    private static final Logger log = LoggerFactory.getLogger(EntryService.class);

    private final EntryRepository entryRepository;
    private final ResourceRepository resourceRepository;
    private final TagRepository tagRepository;
    private final OllamaTitleService ollamaTitleService;
    private final OllamaTagsService ollamaTagsService;
    private final SpotifySongLinkService spotifySongLinkService;
    private final YouTubeVideoLinkService youTubeVideoLinkService;
    private final TwitchVideoLinkService twitchVideoLinkService;
    private final LinkMetadataService linkMetadataService;
    private final EntryRelationshipService entryRelationshipService;
    private final UserRepository userRepository;
    private final EntrySemanticIndexService entrySemanticIndexService;
    private final EntryProcessingService entryProcessingService;
    private final ObjectMapper objectMapper;

    public EntryService(
        EntryRepository entryRepository,
        ResourceRepository resourceRepository,
        TagRepository tagRepository,
        OllamaTitleService ollamaTitleService,
        OllamaTagsService ollamaTagsService,
        SpotifySongLinkService spotifySongLinkService,
        YouTubeVideoLinkService youTubeVideoLinkService,
        TwitchVideoLinkService twitchVideoLinkService,
        LinkMetadataService linkMetadataService,
        EntryRelationshipService entryRelationshipService,
        UserRepository userRepository,
        EntrySemanticIndexService entrySemanticIndexService,
        EntryProcessingService entryProcessingService,
        ObjectMapper objectMapper
    ) {
        this.entryRepository = entryRepository;
        this.resourceRepository = resourceRepository;
        this.tagRepository = tagRepository;
        this.ollamaTitleService = ollamaTitleService;
        this.ollamaTagsService = ollamaTagsService;
        this.spotifySongLinkService = spotifySongLinkService;
        this.youTubeVideoLinkService = youTubeVideoLinkService;
        this.twitchVideoLinkService = twitchVideoLinkService;
        this.linkMetadataService = linkMetadataService;
        this.entryRelationshipService = entryRelationshipService;
        this.userRepository = userRepository;
        this.entrySemanticIndexService = entrySemanticIndexService;
        this.entryProcessingService = entryProcessingService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<EntryResponse> findAll(Long userId) {
        return entryRepository.findAllByUserIdOrderByCreateDateDesc(userId).stream()
            .map(this::toEntryResponse)
            .toList();
    }

    @Transactional(readOnly = true)
    public EntryResponse findById(Long userId, Long entryId) {
        return toEntryResponse(getEntryOrThrow(userId, entryId));
    }

    @Transactional
    public List<EntryResponse> search(Long userId, String rawQuery) {
        String query = trimRequired(rawQuery, "q is required");
        List<Entry> entries = entryRepository.findAllByUserIdOrderByCreateDateDesc(userId);
        Optional<double[]> queryEmbedding = generateQueryEmbedding(query);
        List<SearchMatch> matches = entries.stream()
            .map(entry -> toSearchMatch(entry, query, queryEmbedding))
            .filter(match -> match.shouldInclude(queryEmbedding.isPresent()))
            .sorted(
                Comparator.comparingDouble(SearchMatch::hybridScore)
                    .reversed()
                    .thenComparing(SearchMatch::updatedAt, Comparator.reverseOrder())
            )
            .toList();

        if (matches.isEmpty()) {
            return List.of();
        }

        double bestHybridScore = matches.getFirst().hybridScore();
        double bestSemanticScore = matches.getFirst().semanticScore();
        boolean hasStrongLexicalMatch = matches.stream().anyMatch(match -> match.lexicalScore() >= 0.18d);
        double relativeCutoff = queryEmbedding.isPresent()
            ? Math.max(0.32d, bestHybridScore * 0.62d)
            : 0.0d;

        return matches.stream()
            .filter(match -> {
                if (!queryEmbedding.isPresent()) {
                    return true;
                }

                if (hasStrongLexicalMatch) {
                    return match.lexicalScore() >= 0.18d || match.hybridScore() >= relativeCutoff;
                }

                double semanticCutoff = Math.max(0.56d, bestSemanticScore - 0.04d);
                double hybridSemanticCutoff = Math.max(0.42d, bestHybridScore - 0.05d);
                return match.semanticScore() >= semanticCutoff && match.hybridScore() >= hybridSemanticCutoff;
            })
            .limit(queryEmbedding.isPresent() && !hasStrongLexicalMatch ? 3 : 25)
            .collect(Collectors.toMap(
                match -> match.entry().getId(),
                match -> match,
                (left, _right) -> left,
                LinkedHashMap::new
            ))
            .values()
            .stream()
            .map(match -> toEntryResponse(match.entry()))
            .toList();
    }

    @Transactional
    public void reprocessAll(Long userId) {
        List<Entry> entries = entryRepository.findAllByUserIdOrderByCreateDateDesc(userId);
        for (Entry entry : entries) {
            refreshProcessedData(entry);
            entrySemanticIndexService.indexEntry(entry);
        }
    }

    @Transactional
    public EntryResponse createEntry(Long userId, CreateNoteRequest request) {
        try {
            return createEntryInternal(userId, request);
        } catch (ResponseStatusException knownError) {
            throw knownError;
        } catch (Exception unexpectedError) {
            log.error(
                "createEntry unexpected error userId={} flag={}",
                userId,
                request == null ? null : request.getFlag(),
                unexpectedError
            );
            throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "createEntry failed: " + unexpectedError.getClass().getSimpleName(),
                unexpectedError
            );
        }
    }

    private EntryResponse createEntryInternal(Long userId, CreateNoteRequest request) {
        User user = getUserOrThrow(userId);
        boolean youtubeFlag = request.getFlag() == FlagEnum.YOUTUBE;
        boolean twitchFlag = request.getFlag() == FlagEnum.TWITCH;

        Entry entry = new Entry();
        entry.setUser(user);
        entry.setFlag(request.getFlag() != null ? request.getFlag() : FlagEnum.RAW);

        String firstTextContent = null;
        StringBuilder allTextContent = new StringBuilder();
        List<String> uploadedFileNames = new ArrayList<>();
        for (CreateEntryResourceRequest resourceRequest : request.getResources()) {
            if ((youtubeFlag || twitchFlag) && isTextResourceType(resourceRequest.getType())) {
                String rawText = trimOrNull(resourceRequest.getTextContent());
                if (firstTextContent == null && StringUtils.hasText(rawText)) {
                    firstTextContent = rawText;
                }
                if (StringUtils.hasText(rawText)) {
                    if (!allTextContent.isEmpty()) {
                        allTextContent.append('\n');
                    }
                    allTextContent.append(rawText);
                }
                continue;
            }

            Resource resource = buildResource(resourceRequest);
            entry.addResource(resource);
            if (firstTextContent == null
                && resource instanceof TextResource textResource
                && StringUtils.hasText(textResource.getTextContent())) {
                firstTextContent = textResource.getTextContent().trim();
            }
            if (resource instanceof TextResource textResource
                && StringUtils.hasText(textResource.getTextContent())) {
                if (!allTextContent.isEmpty()) {
                    allTextContent.append('\n');
                }
                allTextContent.append(textResource.getTextContent().trim());
            }
            if (resource instanceof LinkResource linkResource) {
                String linkContext = buildLinkContext(linkResource);
                if (firstTextContent == null && StringUtils.hasText(linkContext)) {
                    firstTextContent = linkContext;
                }
                if (StringUtils.hasText(linkContext)) {
                    if (!allTextContent.isEmpty()) {
                        allTextContent.append('\n');
                    }
                    allTextContent.append(linkContext);
                }
            }
            if (resource instanceof MediaResource mediaResource) {
                String fileName = trimOrNull(mediaResource.getFileName());
                if (!StringUtils.hasText(fileName)) {
                    fileName = extractFileNameFromStorageKey(mediaResource.getStorageKey());
                }
                if (StringUtils.hasText(fileName)) {
                    uploadedFileNames.add(fileName);
                }
            }
        }

        if (firstTextContent == null && !uploadedFileNames.isEmpty()) {
            String fallbackText = String.join("\n", uploadedFileNames);
            TextResource filesDescription = new TextResource();
            filesDescription.setTitle("Archivos");
            filesDescription.setTextContent(fallbackText);
            entry.addResource(filesDescription);
            firstTextContent = fallbackText;
            allTextContent.append(fallbackText);
        }

        if (youtubeFlag) {
            List<YouTubeVideoLinkService.YouTubeVideoLink> youtubeLinks =
                new ArrayList<>(youTubeVideoLinkService.resolveVideoLinks(allTextContent.toString()));
            if (youtubeLinks.isEmpty()) {
                youTubeVideoLinkService.searchFirstVideoByQuery(allTextContent.toString())
                    .ifPresent(youtubeLinks::add);
            }
            if (youtubeLinks.isEmpty()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No YouTube video found from text or links"
                );
            }

            for (YouTubeVideoLinkService.YouTubeVideoLink link : youtubeLinks) {
                LinkResource youtubeResource = new LinkResource();
                youtubeResource.setTitle(link.title());
                youtubeResource.setUrl(link.videoUrl());
                entry.addResource(youtubeResource);
            }

            String youtubeContext = youtubeLinks.stream()
                .map(YouTubeVideoLinkService.YouTubeVideoLink::title)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining("\n"));
            if (StringUtils.hasText(youtubeContext)) {
                if (!allTextContent.isEmpty()) {
                    allTextContent.append('\n');
                }
                allTextContent.append(youtubeContext);
                firstTextContent = youtubeLinks.get(0).title();
            }
        }

        if (twitchFlag) {
            List<TwitchVideoLinkService.TwitchVideoLink> twitchLinks =
                new ArrayList<>(twitchVideoLinkService.resolveLinks(allTextContent.toString()));
            if (twitchLinks.isEmpty()) {
                twitchVideoLinkService.searchFirstLinkByQuery(allTextContent.toString())
                    .ifPresent(twitchLinks::add);
            }
            if (twitchLinks.isEmpty()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No Twitch link found from text or links"
                );
            }

            for (TwitchVideoLinkService.TwitchVideoLink link : twitchLinks) {
                LinkResource twitchResource = new LinkResource();
                twitchResource.setTitle(link.title());
                twitchResource.setUrl(link.url());
                entry.addResource(twitchResource);
            }

            String twitchContext = twitchLinks.stream()
                .map(TwitchVideoLinkService.TwitchVideoLink::title)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining("\n"));
            if (StringUtils.hasText(twitchContext)) {
                if (!allTextContent.isEmpty()) {
                    allTextContent.append('\n');
                }
                allTextContent.append(twitchContext);
                firstTextContent = twitchLinks.get(0).title();
            }
        }

        String title = trimOrNull(request.getTitle());
        if (!StringUtils.hasText(title) && StringUtils.hasText(firstTextContent)) {
            try {
                title = ollamaTitleService.generateTitle(firstTextContent);
            } catch (ResponseStatusException ignored) {
                title = firstTextContent.length() > 120 ? firstTextContent.substring(0, 120).trim() : firstTextContent;
            }
        }
        if (!StringUtils.hasText(title)) {
            title = "Nueva entrada";
        }
        entry.setTitle(trimRequired(title, "title is required"));

        if (request.getNotification()) {
            String notificationContext = allTextContent.isEmpty() ? title : allTextContent.toString();
            entry.setNotificationDate(ollamaTitleService.extractNotificationDate(notificationContext).orElse(null));
            log.info("createEntry extracted notificationDate={}", entry.getNotificationDate());
        } else {
            log.info("createEntry notification=false userId={} flag={}", userId, entry.getFlag());
            entry.setNotificationDate(null);
        }

        String spotifyContext = allTextContent.toString().trim();
        if (!StringUtils.hasText(spotifyContext)) {
            spotifyContext = title;
        }
        if (request.getFlag() == FlagEnum.SPOTIFY && StringUtils.hasText(spotifyContext)) {
            spotifySongLinkService.findSongLinkForSpotifyFlag(spotifyContext).ifPresent(link -> {
                LinkResource songLink = new LinkResource();
                songLink.setTitle("Cancion principal en Spotify");
                songLink.setUrl(link);
                entry.addResource(songLink);
            });
        }

        if (entry.getFlag() == FlagEnum.CHECKLIST) {
            String checklistContext = allTextContent.isEmpty() ? title : allTextContent.toString();
            if (StringUtils.hasText(checklistContext)) {
                try {
                    String todoList = ollamaTitleService.generateTodoList(checklistContext);
                    TextResource checklistResource = new TextResource();
                    checklistResource.setTitle("Checklist");
                    checklistResource.setTextContent(todoList);
                    entry.addResource(checklistResource);
                    log.info("createEntry checklist generated for userId={}", userId);
                } catch (Exception ex) {
                    log.warn("createEntry checklist generation failed for userId={}", userId, ex);
                }
            }
        }

        // Manejar tags - IA siempre sugiere basada en contenido
        List<Tag> allTags = tagRepository.findAll();
        List<String> existingTagNames = allTags.stream().map(Tag::getName).toList();
        
        String contentForTags = entry.getTitle() + "\n" + allTextContent;
        List<String> suggestedTagNames = ollamaTagsService.suggestTags(contentForTags, existingTagNames);
        
        for (String tagName : suggestedTagNames) {
            Tag tag = tagRepository.findByName(tagName)
                .orElseGet(() -> {
                    Tag newTag = new Tag();
                    newTag.setName(tagName);
                    return tagRepository.save(newTag);
                });
            entry.addTag(tag);
        }
        Entry savedEntry = entryRepository.save(entry);
        refreshProcessedData(savedEntry);
        entrySemanticIndexService.indexEntry(savedEntry);
        return toEntryResponse(savedEntry);
    }

    @Transactional
    public EntryResponse updateEntry(Long userId, Long entryId, UpdateEntryRequest request) {
        Entry entry = getEntryOrThrow(userId, entryId);
        entry.setTitle(trimRequired(request.getTitle(), "title is required"));
        entry.touch();
        refreshProcessedData(entry);
        Entry savedEntry = entryRepository.save(entry);
        entrySemanticIndexService.indexEntry(savedEntry);
        return toEntryResponse(savedEntry);
    }

    @Transactional
    public ResourceResponse addTextResource(Long userId, Long entryId, CreateTextResourceRequest request) {
        TextResource resource = new TextResource();
        resource.setTitle(trimOrNull(request.getTitle()));
        resource.setTextContent(trimRequired(request.getTextContent(), "textContent is required"));
        return saveResource(userId, entryId, resource);
    }

    @Transactional
    public ResourceResponse addLinkResource(Long userId, Long entryId, CreateLinkResourceRequest request) {
        LinkResource resource = buildLinkResource(
            trimOrNull(request.getTitle()),
            trimRequired(request.getUrl(), "url is required")
        );
        return saveResource(userId, entryId, resource);
    }

    @Transactional
    public ResourceResponse addMediaResource(Long userId, Long entryId, CreateMediaResourceRequest request) {
        MediaResource resource = new MediaResource();
        resource.setTitle(trimOrNull(request.getTitle()));
        resource.setStorageKey(trimRequired(request.getStorageKey(), "storageKey is required"));
        resource.setFileName(trimOrNull(request.getFileName()));
        resource.setMimeType(trimOrNull(request.getMimeType()));
        return saveResource(userId, entryId, resource);
    }

    @Transactional
    public ResourceResponse updateTextResource(
        Long userId,
        Long entryId,
        Long resourceId,
        UpdateTextResourceRequest request
    ) {
        Resource resource = getResourceOrThrow(resourceId);
        Entry parent = resource.getEntry();

        if (!parent.getId().equals(entryId) || !parent.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resource not found in entry");
        }

        if (!(resource instanceof TextResource textResource)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Resource is not RAW");
        }

        textResource.setTitle(trimOrNull(request.getTitle()));
        textResource.setTextContent(trimRequired(request.getTextContent(), "textContent is required"));
        parent.touch();
        refreshProcessedData(parent);
        entrySemanticIndexService.indexEntry(parent);

        return toResourceResponse(textResource);
    }

    @Transactional
    public void deleteResource(Long userId, Long entryId, Long resourceId) {
        Resource resource = getResourceOrThrow(resourceId);
        if (!resource.getEntry().getId().equals(entryId) || !resource.getEntry().getUser().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Resource not found in entry");
        }
        Entry parent = resource.getEntry();
        parent.removeResource(resource);
        refreshProcessedData(parent);
        entrySemanticIndexService.indexEntry(parent);
    }

    @Transactional
    public void deleteEntry(Long userId, Long entryId) {
        Entry entry = getEntryOrThrow(userId, entryId);
        entryRelationshipService.deleteForEntry(entryId);
        entrySemanticIndexService.deleteEmbedding(entryId);
        entryRepository.delete(entry);
    }

    private ResourceResponse saveResource(Long userId, Long entryId, Resource resource) {
        Entry entry = getEntryOrThrow(userId, entryId);
        entry.addResource(resource);
        Resource savedResource = resourceRepository.save(resource);
        entrySemanticIndexService.indexEntry(entry);
        return toResourceResponse(savedResource);
    }

    private Resource buildResource(CreateEntryResourceRequest request) {
        if (request.getType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "resource type is required");
        }

        return switch (request.getType()) {
            case RAW -> {
                TextResource resource = new TextResource();
                resource.setTitle(trimOrNull(request.getTitle()));
                resource.setTextContent(trimRequired(request.getTextContent(), "textContent is required for RAW"));
                yield resource;
            }
            case LINK -> {
                yield buildLinkResource(
                    trimOrNull(request.getTitle()),
                    trimRequired(request.getUrl(), "url is required for LINK")
                );
            }
            case MEDIA -> {
                MediaResource resource = new MediaResource();
                resource.setTitle(trimOrNull(request.getTitle()));
                resource.setStorageKey(trimRequired(request.getStorageKey(), "storageKey is required for MEDIA"));
                resource.setFileName(trimOrNull(request.getFileName()));
                resource.setMimeType(trimOrNull(request.getMimeType()));
                yield resource;
            }
        };
    }

    private Entry getEntryOrThrow(Long userId, Long entryId) {
        return entryRepository.findByIdAndUserId(entryId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
    }

    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private Resource getResourceOrThrow(Long resourceId) {
        return resourceRepository.findById(resourceId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resource not found"));
    }

    private EntryResponse toEntryResponse(Entry entry) {
        List<ResourceResponse> resources = entry.getResources().stream()
            .map(this::toResourceResponse)
            .toList();

        List<TagResponse> tags = entry.getTags().stream()
            .map(tag -> new TagResponse(tag.getId(), tag.getName(), tag.getCreatedAt()))
            .toList();

        return new EntryResponse(
            entry.getId(),
            entry.getTitle(),
            entry.getFlag(),
            resources,
            tags,
            entry.getProcessingCategory(),
            readStringList(entry.getProcessingKeyIdeasJson()),
            readStringList(entry.getProcessingActionsJson()),
            entry.getNotificationDate(),
            entry.getCreateDate(),
            entry.getUpdateDate()
        );
    }

    private ResourceResponse toResourceResponse(Resource resource) {
        String textContent = null;
        String url = null;
        String siteName = null;
        String description = null;
        String contentPreview = null;
        String storageKey = null;
        String fileName = null;
        String mimeType = null;

        if (resource instanceof TextResource textResource) {
            textContent = textResource.getTextContent();
        } else if (resource instanceof LinkResource linkResource) {
            url = linkResource.getUrl();
            siteName = linkResource.getSiteName();
            description = linkResource.getDescription();
            contentPreview = linkResource.getContentPreview();
        } else if (resource instanceof MediaResource mediaResource) {
            storageKey = mediaResource.getStorageKey();
            fileName = mediaResource.getFileName();
            mimeType = mediaResource.getMimeType();
        }

        return new ResourceResponse(
            resource.getId(),
            resource.getType(),
            resource.getTitle(),
            textContent,
            url,
            siteName,
            description,
            contentPreview,
            storageKey,
            fileName,
            mimeType,
            resource.getCreatedAt()
        );
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String trimRequired(String value, String errorMessage) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        return value.trim();
    }

    private LinkResource buildLinkResource(String requestedTitle, String url) {
        LinkResource resource = new LinkResource();
        resource.setUrl(url);

        LinkMetadataService.LinkMetadata metadata = linkMetadataService.extract(url).orElse(null);
        resource.setTitle(firstNonBlank(requestedTitle, metadata == null ? null : metadata.title(), fallbackLinkTitle(url)));
        resource.setSiteName(metadata == null ? null : metadata.siteName());
        resource.setDescription(metadata == null ? null : metadata.description());
        resource.setContentPreview(metadata == null ? null : metadata.contentPreview());
        return resource;
    }

    private String buildLinkContext(LinkResource resource) {
        return List.of(
                trimOrNull(resource.getTitle()),
                trimOrNull(resource.getDescription()),
                trimOrNull(resource.getContentPreview()),
                trimOrNull(resource.getSiteName()),
                trimOrNull(resource.getUrl())
            ).stream()
            .filter(StringUtils::hasText)
            .collect(Collectors.joining("\n"));
    }

    private String fallbackLinkTitle(String rawUrl) {
        String trimmedUrl = trimOrNull(rawUrl);
        if (!StringUtils.hasText(trimmedUrl)) {
            return null;
        }
        String normalized = trimmedUrl.replaceFirst("(?i)^https?://", "").replaceFirst("^www\\.", "");
        int slashIndex = normalized.indexOf('/');
        if (slashIndex >= 0) {
            normalized = normalized.substring(0, slashIndex);
        }
        return trimOrNull(normalized);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private static boolean isTextResourceType(ResourceType type) {
        return type == ResourceType.RAW;
    }

    private static String extractFileNameFromStorageKey(String storageKey) {
        String key = trimOrNull(storageKey);
        if (!StringUtils.hasText(key)) {
            return null;
        }
        int separatorIndex = key.lastIndexOf('/');
        if (separatorIndex < 0 || separatorIndex + 1 >= key.length()) {
            return key;
        }
        return key.substring(separatorIndex + 1);
    }

    private Optional<double[]> generateQueryEmbedding(String query) {
        try {
            return Optional.of(entrySemanticIndexService.ensureEmbeddingForQuery(query));
        } catch (Exception ex) {
            log.warn("Semantic query embedding failed, falling back to lexical search");
            return Optional.empty();
        }
    }

    private SearchMatch toSearchMatch(Entry entry, String query, Optional<double[]> queryEmbedding) {
        String searchDocument = entrySemanticIndexService.buildSearchDocument(entry);
        double lexicalScore = computeLexicalScore(query, searchDocument, entry);
        double semanticScore = 0.0d;

        if (queryEmbedding.isPresent()) {
            Optional<double[]> entryEmbedding = entrySemanticIndexService.ensureEmbedding(entry);
            if (entryEmbedding.isPresent()) {
                semanticScore = cosineSimilarity(queryEmbedding.get(), entryEmbedding.get());
            }
        }

        double hybridScore = queryEmbedding.isPresent()
            ? (semanticScore * 0.75d) + (lexicalScore * 0.25d)
            : lexicalScore;

        return new SearchMatch(entry, lexicalScore, semanticScore, hybridScore);
    }

    private double computeLexicalScore(String query, String searchDocument, Entry entry) {
        String normalizedQuery = normalizeForSearch(query);
        if (!StringUtils.hasText(normalizedQuery) || !StringUtils.hasText(searchDocument)) {
            return 0.0d;
        }

        String normalizedDocument = normalizeForSearch(searchDocument);
        String normalizedTitle = normalizeForSearch(entry.getTitle());
        Set<String> queryTokens = tokenize(normalizedQuery);

        double score = 0.0d;
        if (StringUtils.hasText(normalizedTitle) && normalizedTitle.contains(normalizedQuery)) {
            score += 0.55d;
        }
        if (normalizedDocument.contains(normalizedQuery)) {
            score += 0.25d;
        }

        long matchedTokens = queryTokens.stream()
            .filter(normalizedDocument::contains)
            .count();
        if (!queryTokens.isEmpty()) {
            score += Math.min(0.20d, (double) matchedTokens / (double) queryTokens.size() * 0.20d);
        }

        long tagMatches = entry.getTags().stream()
            .map(Tag::getName)
            .filter(StringUtils::hasText)
            .map(this::normalizeForSearch)
            .filter(tagName -> tagName.contains(normalizedQuery) || queryTokens.stream().anyMatch(tagName::contains))
            .count();
        if (tagMatches > 0) {
            score += Math.min(0.20d, 0.08d * tagMatches);
        }

        return Math.min(1.0d, score);
    }

    private Set<String> tokenize(String value) {
        return java.util.Arrays.stream(value.split("[^\\p{L}\\p{Nd}]+"))
            .map(String::trim)
            .filter(token -> token.length() >= 2)
            .collect(Collectors.toSet());
    }

    private String normalizeForSearch(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }

        String normalized = Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return normalized.replaceAll("\\p{M}+", "");
    }

    private double cosineSimilarity(double[] left, double[] right) {
        if (left.length == 0 || right.length == 0 || left.length != right.length) {
            return 0.0d;
        }

        double dot = 0.0d;
        double leftNorm = 0.0d;
        double rightNorm = 0.0d;
        for (int index = 0; index < left.length; index += 1) {
            dot += left[index] * right[index];
            leftNorm += left[index] * left[index];
            rightNorm += right[index] * right[index];
        }

        if (leftNorm == 0.0d || rightNorm == 0.0d) {
            return 0.0d;
        }
        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }

    private record SearchMatch(Entry entry, double lexicalScore, double semanticScore, double hybridScore) {
        private boolean shouldInclude(boolean semanticEnabled) {
            if (semanticEnabled) {
                return hybridScore >= 0.28d || lexicalScore >= 0.12d || semanticScore >= 0.38d;
            }
            return lexicalScore > 0.0d;
        }

        private java.time.Instant updatedAt() {
            return entry.getUpdateDate();
        }
    }

    private void refreshProcessedData(Entry entry) {
        try {
            EntryProcessingService.EntryProcessingResult result = entryProcessingService.analyze(entry);
            entry.setProcessingCategory(trimOrNull(result.category()));
            entry.setProcessingKeyIdeasJson(writeStringList(result.keyIdeas()));
            entry.setProcessingActionsJson(writeStringList(result.actions()));
        } catch (Exception ex) {
            log.warn("Failed to process entry insights for entryId={}", entry == null ? null : entry.getId(), ex);
        }
    }

    private String writeStringList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (Exception ex) {
            return "[]";
        }
    }

    private List<String> readStringList(String rawJson) {
        if (!StringUtils.hasText(rawJson)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(rawJson, new TypeReference<List<String>>() { });
        } catch (Exception ex) {
            return List.of();
        }
    }
}
