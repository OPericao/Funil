package com.pisito.app.service;

import com.pisito.app.controller.dto.entry.CreateEntryResourceRequest;
import com.pisito.app.controller.dto.entry.EntryMentionResponse;
import com.pisito.app.controller.dto.entry.CreateNoteRequest;
import com.pisito.app.controller.dto.entry.EntrySearchDebugResponse;
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
import com.pisito.app.util.RichTextContentUtils;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class EntryService {

    private static final Logger log = LoggerFactory.getLogger(EntryService.class);
    private static final Map<String, List<String>> BROAD_QUERY_ALIASES = Map.of(
        "informatica", List.of("tecnologia", "technology", "tech", "programacion", "programming", "software", "desarrollo", "development", "web", "frontend", "backend", "codigo", "code", "computacion", "computing"),
        "comida", List.of("food", "foods", "meal", "meals", "dish", "dishes", "cocina", "cooking", "receta", "recipe", "recipes", "plato", "gastronomia", "restaurant", "restaurante", "ingredientes", "ingredients", "alimento", "alimentos"),
        "musica", List.of("music", "song", "songs", "cancion", "canciones", "album", "albums", "artista", "artist", "playlist", "concierto", "concert"),
        "viaje", List.of("travel", "trip", "trips", "journey", "turismo", "tourism", "destino", "destination", "ruta", "route", "escapada", "getaway", "vuelo", "flight", "hotel")
    );
    private static final List<List<String>> LEXICAL_FAMILY_GROUPS = List.of(
        List.of("diversion", "diversiones", "divertido", "divertida", "divertidos", "divertidas", "divertir", "divertirse", "entretenido", "entretenida", "entretenimiento", "ocio", "ameno", "amena"),
        List.of("comida", "comidas", "comer", "comiendo", "alimento", "alimentos", "alimentacion", "cocina", "cocinar", "receta", "recetas", "plato", "platos"),
        List.of("viaje", "viajes", "viajar", "viajero", "viajera", "turismo", "turistico", "turistica", "destino", "destinos", "ruta", "rutas"),
        List.of("musica", "musical", "musicales", "musico", "cancion", "canciones", "sonido", "sonidos"),
        List.of("tecnologia", "tecnologico", "tecnologica", "tecnologicos", "tecnologicas", "digital", "software", "programacion", "programar", "codigo", "desarrollo")
    );
    private static final Map<String, List<String>> VECTOR_TOPIC_TERMS = Map.of(
        "technology", List.of("technology", "tecnologia", "software", "web", "frontend"),
        "web", List.of("web", "website", "frontend", "backend"),
        "frontend", List.of("frontend", "web", "ui", "react"),
        "backend", List.of("backend", "api", "database", "server"),
        "food", List.of("food", "comida", "receta", "ingredientes"),
        "vegetable", List.of("vegetable", "verduras", "food"),
        "fruit", List.of("fruit", "fruta", "food"),
        "music", List.of("music", "musica", "cancion", "album"),
        "travel", List.of("travel", "viaje", "turismo", "destino")
    );

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
    private final EntryVectorStoreService entryVectorStoreService;
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
        EntryVectorStoreService entryVectorStoreService,
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
        this.entryVectorStoreService = entryVectorStoreService;
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

    @Transactional(readOnly = true)
    public List<EntryMentionResponse> findAllMentions(Long userId) {
        return entryRepository.findAllByUserIdOrderByCreateDateDesc(userId).stream()
            .map(entry -> new EntryMentionResponse(entry.getId(), entry.getTitle()))
            .toList();
    }

    @Transactional
    public List<EntryResponse> search(Long userId, String rawQuery) {
        String query = trimRequired(rawQuery, "q is required");
        boolean broadQuery = isBroadSemanticQuery(query);
        String semanticQuery = buildSemanticQuery(query, broadQuery);
        List<Entry> entries = entryRepository.findAllByUserIdOrderByCreateDateDesc(userId);
        if (entries.isEmpty()) {
            return List.of();
        }

        Optional<QueryEmbeddings> queryEmbeddings = generateQueryEmbeddings(query, semanticQuery);
        List<SearchCandidate> matches = searchHybrid(userId, query, entries, queryEmbeddings, broadQuery);

        if (matches.isEmpty()) {
            return List.of();
        }

        return matches.stream()
            .collect(Collectors.toMap(
                match -> match.entry().getId(),
                match -> match,
                (left, _right) -> left,
                LinkedHashMap::new
            ))
            .values()
            .stream()
            .map(this::toEntryResponse)
            .toList();
    }

    private List<SearchCandidate> searchHybrid(
        Long userId,
        String query,
        List<Entry> entries,
        Optional<QueryEmbeddings> queryEmbeddings,
        boolean broadQuery
    ) {
        SearchQueryContext context = buildSearchQueryContext(query, broadQuery);
        Map<Long, Double> semanticScores = queryEmbeddings.isPresent() && entryVectorStoreService.isReady()
            ? collectSemanticScores(userId, queryEmbeddings.get(), context)
            : Map.of();

        List<SearchCandidate> candidates = entries.stream()
            .map(entry -> toSearchCandidate(entry, context, semanticScores.getOrDefault(entry.getId(), 0.0d)))
            .filter(candidate -> candidate.finalScore() > 0.0d)
            .toList();
        if (candidates.isEmpty()) {
            return List.of();
        }

        boolean hasStrongStructuredMatches = candidates.stream().anyMatch(candidate ->
            candidate.structuredScore() >= 0.55d
                || candidate.topicScore() >= 0.50d
                || candidate.tagScore() >= 0.60d
        );

        return candidates.stream()
            .filter(candidate -> shouldIncludeCandidate(candidate, context, hasStrongStructuredMatches))
            .sorted(
                Comparator.comparingDouble(SearchCandidate::finalScore)
                    .reversed()
                    .thenComparing(SearchCandidate::structuredScore, Comparator.reverseOrder())
                    .thenComparing(SearchCandidate::semanticScore, Comparator.reverseOrder())
                    .thenComparing(candidate -> candidate.entry().getUpdateDate(), Comparator.reverseOrder())
            )
            .limit(context.broadQuery() ? 12 : 20)
            .toList();
    }

    @Transactional
    public List<EntryResponse> findSemanticNeighbors(Long userId, Long entryId, int limit) {
        if (entryId == null || limit <= 0) {
            return List.of();
        }

        Entry sourceEntry = getEntryOrThrow(userId, entryId);
        Optional<double[]> sourceEmbedding = entrySemanticIndexService.ensureEmbedding(sourceEntry);
        if (sourceEmbedding.isEmpty()) {
            return List.of();
        }

        List<Long> similarEntryIds = entryVectorStoreService.findNearestEntryIds(
            userId,
            sourceEmbedding.get(),
            limit,
            0.45d,
            entryId
        );
        if (similarEntryIds.isEmpty()) {
            return List.of();
        }

        return similarEntryIds.stream()
            .map(similarEntryId -> entryRepository.findByIdAndUserId(similarEntryId, userId).orElse(null))
            .filter(java.util.Objects::nonNull)
            .map(this::toEntryResponse)
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
                String rawText = trimOrNull(RichTextContentUtils.extractPlainTextWithLinks(resourceRequest.getTextContent()));
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
                firstTextContent = RichTextContentUtils.extractPlainText(textResource.getTextContent());
            }
            if (resource instanceof TextResource textResource
                && StringUtils.hasText(textResource.getTextContent())) {
                if (!allTextContent.isEmpty()) {
                    allTextContent.append('\n');
                }
                allTextContent.append(RichTextContentUtils.extractPlainText(textResource.getTextContent()));
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
            entry.setNotificationDate(
                ollamaTitleService.extractNotificationDate(notificationContext)
                    .orElse(java.time.Instant.now().plus(java.time.Duration.ofDays(1)))
            );
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
        if (!shouldSkipAiRefresh(entry)) {
            refreshProcessedData(entry);
        }
        Entry savedEntry = entryRepository.save(entry);
        if (!shouldSkipAiRefresh(savedEntry)) {
            entrySemanticIndexService.indexEntry(savedEntry);
        }
        return toEntryResponse(savedEntry);
    }

    @Transactional
    public ResourceResponse addTextResource(Long userId, Long entryId, CreateTextResourceRequest request) {
        TextResource resource = new TextResource();
        resource.setTitle(trimOrNull(request.getTitle()));
        resource.setTextContent(trimToEmpty(request.getTextContent()));
        return saveResource(userId, entryId, resource, false);
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
        textResource.setTextContent(trimToEmpty(request.getTextContent()));
        parent.touch();
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
        if (!shouldSkipAiRefresh(parent)) {
            refreshProcessedData(parent);
            entrySemanticIndexService.indexEntry(parent);
        }
    }

    @Transactional
    public void deleteEntry(Long userId, Long entryId) {
        Entry entry = getEntryOrThrow(userId, entryId);
        entryRelationshipService.deleteForEntry(entryId);
        entrySemanticIndexService.deleteEmbedding(entryId);
        entryRepository.delete(entry);
    }

    private ResourceResponse saveResource(Long userId, Long entryId, Resource resource) {
        return saveResource(userId, entryId, resource, true);
    }

    private ResourceResponse saveResource(Long userId, Long entryId, Resource resource, boolean refreshAi) {
        Entry entry = getEntryOrThrow(userId, entryId);
        entry.addResource(resource);
        Resource savedResource = resourceRepository.save(resource);
        if (refreshAi && !shouldSkipAiRefresh(entry)) {
            entrySemanticIndexService.indexEntry(entry);
        }
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
                resource.setTextContent(trimToEmpty(request.getTextContent()));
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
        return toEntryResponse(entry, null);
    }

    private EntryResponse toEntryResponse(SearchCandidate candidate) {
        return toEntryResponse(
            candidate.entry(),
            new EntrySearchDebugResponse(
                roundDebugScore(candidate.topicScore()),
                roundDebugScore(candidate.tagScore()),
                roundDebugScore(candidate.noteScore()),
                roundDebugScore(candidate.titleScore()),
                roundDebugScore(candidate.semanticScore()),
                roundDebugScore(candidate.conflictPenalty()),
                roundDebugScore(candidate.structuredScore()),
                roundDebugScore(candidate.finalScore()),
                candidate.directTagMatches(),
                new ArrayList<>(candidate.queryTopics()),
                new ArrayList<>(candidate.tagTopics())
            )
        );
    }

    private EntryResponse toEntryResponse(Entry entry, EntrySearchDebugResponse searchDebug) {
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
            entry.getUpdateDate(),
            searchDebug
        );
    }

    private double roundDebugScore(double value) {
        return Math.round(value * 1000.0d) / 1000.0d;
    }

    private ResourceResponse toResourceResponse(Resource resource) {
        String textContent = null;
        String url = null;
        String siteName = null;
        String description = null;
        String contentPreview = null;
        String previewImageUrl = null;
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
            previewImageUrl = linkResource.getPreviewImageUrl();
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
            previewImageUrl,
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

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private LinkResource buildLinkResource(String requestedTitle, String url) {
        LinkResource resource = new LinkResource();
        resource.setUrl(url);

        LinkMetadataService.LinkMetadata metadata = linkMetadataService.extract(url).orElse(null);
        resource.setTitle(firstNonBlank(requestedTitle, metadata == null ? null : metadata.title(), fallbackLinkTitle(url)));
        resource.setSiteName(metadata == null ? null : metadata.siteName());
        resource.setDescription(metadata == null ? null : metadata.description());
        resource.setContentPreview(metadata == null ? null : metadata.contentPreview());
        resource.setPreviewImageUrl(metadata == null ? null : metadata.previewImageUrl());
        return resource;
    }

    private String buildLinkContext(LinkResource resource) {
        return Stream.of(
                trimOrNull(resource.getTitle()),
                trimOrNull(resource.getDescription()),
                trimOrNull(resource.getContentPreview()),
                trimOrNull(resource.getSiteName()),
                trimOrNull(resource.getUrl())
            )
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

    private Optional<QueryEmbeddings> generateQueryEmbeddings(String query, String semanticQuery) {
        try {
            double[] contentVector = entrySemanticIndexService.ensureEmbeddingForQuery(query);
            double[] focusVector = normalizeForSearch(query).equals(normalizeForSearch(semanticQuery))
                ? contentVector
                : entrySemanticIndexService.ensureEmbeddingForQuery(semanticQuery);
            return Optional.of(new QueryEmbeddings(contentVector, focusVector));
        } catch (Exception ex) {
            log.warn("Semantic query embedding failed, falling back to lexical search");
            return Optional.empty();
        }
    }

    private SearchQueryContext buildSearchQueryContext(String query, boolean broadQuery) {
        String normalizedQuery = normalizeForSearch(query);
        Set<String> queryTokens = tokenize(normalizedQuery);
        Set<String> supportTerms = buildQuerySupportTerms(query, broadQuery);
        Set<String> canonicalTopics = entrySemanticIndexService.extractCanonicalTopics(String.join(" ", supportTerms));
        return new SearchQueryContext(query, normalizedQuery, queryTokens, supportTerms, canonicalTopics, broadQuery);
    }

    private Map<Long, Double> collectSemanticScores(Long userId, QueryEmbeddings queryEmbeddings, SearchQueryContext context) {
        Map<Long, Double> semanticScores = new LinkedHashMap<>();

        mergeSemanticScores(
            semanticScores,
            entryVectorStoreService.findNearestEntryMatches(
                userId,
                queryEmbeddings.content(),
                context.broadQuery() ? 24 : 36,
                context.broadQuery() ? 0.16d : 0.14d,
                null,
                EntryVectorStoreService.VectorKind.CONTENT
            ),
            context.broadQuery() ? 0.35d : 0.45d
        );
        mergeSemanticScores(
            semanticScores,
            entryVectorStoreService.findNearestEntryMatches(
                userId,
                queryEmbeddings.focus(),
                context.broadQuery() ? 24 : 28,
                context.broadQuery() ? 0.14d : 0.12d,
                null,
                EntryVectorStoreService.VectorKind.FOCUS
            ),
            context.broadQuery() ? 0.65d : 0.55d
        );

        return semanticScores;
    }

    private void mergeSemanticScores(
        Map<Long, Double> semanticScores,
        List<EntryVectorStoreService.NeighborMatch> candidates,
        double weight
    ) {
        for (EntryVectorStoreService.NeighborMatch candidate : candidates) {
            semanticScores.merge(candidate.entryId(), candidate.similarity() * weight, Double::max);
        }
    }

    private SearchCandidate toSearchCandidate(Entry entry, SearchQueryContext context, double semanticScore) {
        String searchDocument = entrySemanticIndexService.buildSearchDocument(entry);
        String normalizedDocument = normalizeForSearch(searchDocument);
        String normalizedTitle = normalizeForSearch(entry.getTitle());

        double topicScore = computeCanonicalTopicScore(entry, context.canonicalTopics());
        Set<String> queryTopics = entrySemanticIndexService.extractCanonicalTopics(String.join(" ", context.supportTerms()));
        Set<String> tagTopics = entrySemanticIndexService.extractCanonicalTopics(
            entry.getTags().stream()
                .map(Tag::getName)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining(" "))
        );
        int directTagMatches = countDirectTagMatches(entry, context.normalizedQuery(), context.queryTokens(), context.supportTerms(), context.broadQuery());
        double tagScore = computeTagSupportScore(
            entry,
            context.normalizedQuery(),
            context.queryTokens(),
            context.supportTerms(),
            context.broadQuery()
        );
        double noteScore = computeDocumentSupportScore(
            normalizedDocument,
            context.normalizedQuery(),
            context.queryTokens(),
            context.supportTerms(),
            context.broadQuery()
        );
        double titleScore = computeTitleSupportScore(
            normalizedTitle,
            context.normalizedQuery(),
            context.supportTerms(),
            context.broadQuery()
        );
        double conflictPenalty = computeConflictPenalty(entry, context.canonicalTopics(), context.broadQuery());

        double structuredScore = context.broadQuery()
            ? (tagScore * 0.42d) + (noteScore * 0.24d) + (titleScore * 0.12d) + (topicScore * 0.22d)
            : (tagScore * 0.34d) + (noteScore * 0.30d) + (titleScore * 0.18d) + (topicScore * 0.18d);
        double finalScore = context.broadQuery()
            ? (structuredScore * 0.90d) + (semanticScore * 0.10d)
            : (structuredScore * 0.72d) + (semanticScore * 0.28d);

        if (titleScore >= 1.0d) {
            structuredScore = Math.max(structuredScore, context.broadQuery() ? 0.72d : 0.78d);
            finalScore = Math.max(finalScore, context.broadQuery() ? 0.74d : 0.82d);
        }

        structuredScore = Math.max(0.0d, structuredScore - conflictPenalty);
        finalScore = Math.max(0.0d, finalScore - conflictPenalty);

        return new SearchCandidate(
            entry,
            topicScore,
            tagScore,
            noteScore,
            titleScore,
            semanticScore,
            conflictPenalty,
            directTagMatches,
            queryTopics,
            tagTopics,
            Math.min(1.0d, structuredScore),
            Math.min(1.0d, finalScore)
        );
    }

    private int countDirectTagMatches(
        Entry entry,
        String normalizedQuery,
        Set<String> queryTokens,
        Set<String> supportTerms,
        boolean broadQuery
    ) {
        if (entry == null) {
            return 0;
        }
        return Math.toIntExact(entry.getTags().stream()
            .map(Tag::getName)
            .filter(StringUtils::hasText)
            .map(this::normalizeForSearch)
            .filter(tagName -> tagName.contains(normalizedQuery)
                || queryTokens.stream().anyMatch(token -> token.length() >= 4 && tagName.contains(token))
                || (broadQuery && hasStrictTagSupport(supportTerms, tagName)))
            .count());
    }

    private boolean shouldIncludeCandidate(
        SearchCandidate candidate,
        SearchQueryContext context,
        boolean hasStrongStructuredMatches
    ) {
        if (context.broadQuery()) {
            boolean broadSupport = hasBroadStructuredSupport(candidate);
            if (hasStrongStructuredMatches) {
                return broadSupport
                    || (candidate.semanticScore() >= 0.97d && candidate.structuredScore() >= 0.24d);
            }

            return (candidate.finalScore() >= 0.30d && broadSupport)
                || candidate.titleScore() >= 0.72d
                || candidate.tagScore() >= 0.40d
                || candidate.topicScore() >= 0.34d
                || (candidate.semanticScore() >= 0.97d && candidate.structuredScore() >= 0.24d);
        }

        return candidate.finalScore() >= 0.16d
            || candidate.titleScore() >= 1.0d
            || candidate.structuredScore() >= 0.18d
            || candidate.semanticScore() >= 0.58d;
    }

    private boolean hasBroadStructuredSupport(SearchCandidate candidate) {
        return candidate.tagScore() >= 0.40d
            || candidate.topicScore() >= 0.34d
            || candidate.titleScore() >= 0.72d
            || candidate.noteScore() >= 0.52d;
    }

    private List<SearchMatch> searchWithPgvector(
        Long userId,
        String query,
        List<Entry> entries,
        QueryEmbeddings queryEmbeddings,
        boolean broadQuery
    ) {
        Set<String> supportTerms = buildQuerySupportTerms(query, broadQuery);
        List<EntryVectorStoreService.NeighborMatch> contentCandidates = entryVectorStoreService.findNearestEntryMatches(
            userId,
            queryEmbeddings.content(),
            broadQuery ? 24 : 40,
            broadQuery ? 0.20d : 0.18d,
            null,
            EntryVectorStoreService.VectorKind.CONTENT
        );
        List<EntryVectorStoreService.NeighborMatch> focusCandidates = entryVectorStoreService.findNearestEntryMatches(
            userId,
            queryEmbeddings.focus(),
            broadQuery ? 24 : 28,
            broadQuery ? 0.18d : 0.16d,
            null,
            EntryVectorStoreService.VectorKind.FOCUS
        );
        if (contentCandidates.isEmpty() && focusCandidates.isEmpty()) {
            return searchInMemory(entries, query, Optional.of(queryEmbeddings.content()), broadQuery);
        }

        Map<Long, Entry> entriesById = entries.stream()
            .collect(Collectors.toMap(
                Entry::getId,
                entry -> entry,
                (left, _right) -> left,
                LinkedHashMap::new
            ));
        Map<Long, SearchMatch> matchesByEntryId = new LinkedHashMap<>();
        Map<Long, double[]> semanticScoresByEntryId = new LinkedHashMap<>();
        mergeSemanticCandidates(semanticScoresByEntryId, contentCandidates, false);
        mergeSemanticCandidates(semanticScoresByEntryId, focusCandidates, true);

        for (Map.Entry<Long, double[]> semanticCandidate : semanticScoresByEntryId.entrySet()) {
            Entry entry = entriesById.get(semanticCandidate.getKey());
            if (entry == null) {
                continue;
            }
            double lexicalScore = computeLexicalScore(query, entrySemanticIndexService.buildSearchDocument(entry), entry);
            double supportScore = broadQuery ? computeHighValueSupportScore(entry, supportTerms) : 0.0d;
            lexicalScore = Math.max(lexicalScore, supportScore);
            double semanticScore = blendSemanticCandidateScores(
                semanticCandidate.getValue()[0],
                semanticCandidate.getValue()[1],
                broadQuery
            );
            if (shouldRejectSemanticCandidate(entry, query, lexicalScore, semanticScore, broadQuery, supportTerms, supportScore)) {
                continue;
            }
            double hybridScore = applySupportBoost(
                blendSearchScores(lexicalScore, semanticScore, query, entry),
                supportScore,
                broadQuery
            );
            SearchMatch match = new SearchMatch(entry, lexicalScore, semanticScore, hybridScore, supportScore);
            if (match.shouldInclude(true, broadQuery)) {
                matchesByEntryId.put(entry.getId(), match);
            }
        }

        for (Entry entry : entries) {
            if (matchesByEntryId.containsKey(entry.getId())) {
                continue;
            }

            double lexicalScore = computeLexicalScore(query, entrySemanticIndexService.buildSearchDocument(entry), entry);
            double supportScore = broadQuery ? computeHighValueSupportScore(entry, supportTerms) : 0.0d;
            lexicalScore = Math.max(lexicalScore, supportScore);
            if (!isStrongLexicalCandidate(query, entry, lexicalScore)) {
                continue;
            }

            SearchMatch match = new SearchMatch(
                entry,
                lexicalScore,
                0.0d,
                applySupportBoost(
                    blendSearchScores(lexicalScore, 0.0d, query, entry),
                    supportScore,
                    broadQuery
                ),
                supportScore
            );
            if (match.shouldInclude(false, broadQuery)) {
                matchesByEntryId.put(entry.getId(), match);
            }
        }

        return rankMatches(matchesByEntryId.values().stream().toList(), true, broadQuery);
    }

    private List<SearchMatch> searchInMemory(
        List<Entry> entries,
        String query,
        Optional<double[]> queryEmbedding,
        boolean broadQuery
    ) {
        List<SearchMatch> matches = entries.stream()
            .map(entry -> toSearchMatch(entry, query, queryEmbedding, broadQuery))
            .filter(match -> match.shouldInclude(queryEmbedding.isPresent(), broadQuery))
            .toList();

        return rankMatches(matches, queryEmbedding.isPresent(), broadQuery);
    }

    private List<SearchMatch> rankMatches(List<SearchMatch> matches, boolean semanticEnabled, boolean broadQuery) {
        if (matches.isEmpty()) {
            return List.of();
        }

        double bestHybridScore = matches.stream()
            .mapToDouble(SearchMatch::hybridScore)
            .max()
            .orElse(0.0d);
        double bestSemanticScore = matches.stream()
            .mapToDouble(SearchMatch::semanticScore)
            .max()
            .orElse(0.0d);
        boolean hasStrongLexicalMatch = matches.stream().anyMatch(match -> match.lexicalScore() >= 0.18d);
        boolean hasSupportedMatch = matches.stream().anyMatch(match -> match.supportScore() >= 0.16d);
        double relativeCutoff = semanticEnabled
            ? Math.max(broadQuery ? 0.34d : 0.24d, bestHybridScore * (broadQuery ? 0.72d : 0.55d))
            : 0.0d;

        return matches.stream()
            .filter(match -> {
                if (!semanticEnabled) {
                    return true;
                }

                if (broadQuery) {
                    if (hasSupportedMatch
                        && match.supportScore() < 0.18d
                        && match.lexicalScore() < 0.10d
                        && match.semanticScore() < Math.max(0.86d, bestSemanticScore - 0.01d)) {
                        return false;
                    }

                    if (hasStrongLexicalMatch) {
                        return match.lexicalScore() >= 0.18d
                            || match.semanticScore() >= Math.max(0.50d, bestSemanticScore - 0.05d)
                            || match.hybridScore() >= relativeCutoff;
                    }

                    return match.semanticScore() >= Math.max(0.52d, bestSemanticScore - 0.04d)
                        || match.hybridScore() >= relativeCutoff;
                }

                if (hasStrongLexicalMatch) {
                    return match.lexicalScore() >= 0.16d
                        || match.semanticScore() >= Math.max(0.36d, bestSemanticScore - 0.08d)
                        || match.hybridScore() >= relativeCutoff;
                }

                return match.semanticScore() >= Math.max(0.28d, bestSemanticScore - 0.10d)
                    || match.hybridScore() >= relativeCutoff;
            })
            .sorted(
                Comparator.comparingDouble(SearchMatch::hybridScore)
                    .reversed()
                    .thenComparing(SearchMatch::semanticScore, Comparator.reverseOrder())
                    .thenComparing(SearchMatch::lexicalScore, Comparator.reverseOrder())
                    .thenComparing(SearchMatch::updatedAt, Comparator.reverseOrder())
            )
            .limit(broadQuery ? 12 : 25)
            .toList();
    }

    private double blendSearchScores(double lexicalScore, double semanticScore, String query, Entry entry) {
        double hybridScore = semanticScore > 0.0d
            ? (semanticScore * 0.72d) + (lexicalScore * 0.28d)
            : lexicalScore;

        String normalizedQuery = normalizeForSearch(query);
        String normalizedTitle = normalizeForSearch(entry.getTitle());
        String searchDocument = normalizeForSearch(entrySemanticIndexService.buildSearchDocument(entry));

        if (StringUtils.hasText(normalizedQuery) && StringUtils.hasText(normalizedTitle) && normalizedTitle.contains(normalizedQuery)) {
            hybridScore += 0.10d;
        }
        if (StringUtils.hasText(normalizedQuery) && StringUtils.hasText(searchDocument) && searchDocument.contains(normalizedQuery)) {
            hybridScore += 0.04d;
        }

        return Math.min(1.0d, hybridScore);
    }

    private void mergeSemanticCandidates(
        Map<Long, double[]> semanticScoresByEntryId,
        List<EntryVectorStoreService.NeighborMatch> candidates,
        boolean focus
    ) {
        for (EntryVectorStoreService.NeighborMatch candidate : candidates) {
            double[] scores = semanticScoresByEntryId.computeIfAbsent(candidate.entryId(), _id -> new double[2]);
            if (focus) {
                scores[1] = Math.max(scores[1], candidate.similarity());
            } else {
                scores[0] = Math.max(scores[0], candidate.similarity());
            }
        }
    }

    private double blendSemanticCandidateScores(double contentSimilarity, double focusSimilarity, boolean broadQuery) {
        if (contentSimilarity <= 0.0d) {
            return focusSimilarity;
        }
        if (focusSimilarity <= 0.0d) {
            return contentSimilarity;
        }
        if (broadQuery) {
            return Math.min(1.0d, (focusSimilarity * 0.65d) + (contentSimilarity * 0.35d));
        }
        return Math.min(1.0d, Math.max(contentSimilarity, (focusSimilarity * 0.55d) + (contentSimilarity * 0.45d)));
    }

    private double applySupportBoost(double hybridScore, double supportScore, boolean broadQuery) {
        if (!broadQuery || supportScore <= 0.0d) {
            return hybridScore;
        }
        return Math.min(1.0d, hybridScore + (supportScore * 0.22d));
    }

    private boolean isStrongLexicalCandidate(String query, Entry entry, double lexicalScore) {
        if (lexicalScore >= 0.18d) {
            return true;
        }

        String normalizedQuery = normalizeForSearch(query);
        String normalizedTitle = normalizeForSearch(entry.getTitle());
        return StringUtils.hasText(normalizedQuery)
            && StringUtils.hasText(normalizedTitle)
            && normalizedTitle.contains(normalizedQuery);
    }

    private boolean shouldRejectSemanticCandidate(
        Entry entry,
        String query,
        double lexicalScore,
        double semanticScore,
        boolean broadQuery,
        Set<String> supportTerms,
        double supportScore
    ) {
        if (entry == null) {
            return false;
        }

        String normalizedQuery = normalizeForSearch(query);
        if (!StringUtils.hasText(normalizedQuery)) {
            return false;
        }

        String normalizedDocument = normalizeForSearch(entrySemanticIndexService.buildSearchDocument(entry));
        boolean hasDirectSupport = hasTextualSupport(supportTerms, normalizedDocument);

        if (entry.getFlag() == FlagEnum.TWITCH && lexicalScore < 0.12d && supportScore < 0.16d && !hasDirectSupport && semanticScore < 0.68d) {
            return true;
        }

        if (!broadQuery) {
            return false;
        }

        if (lexicalScore >= 0.10d || supportScore >= 0.16d || hasHighValueLexicalSupport(entry, supportTerms)) {
            return false;
        }

        return semanticScore < 0.64d;
    }

    private SearchMatch toSearchMatch(Entry entry, String query, Optional<double[]> queryEmbedding, boolean broadQuery) {
        Set<String> supportTerms = buildQuerySupportTerms(query, broadQuery);
        String searchDocument = entrySemanticIndexService.buildSearchDocument(entry);
        double lexicalScore = computeLexicalScore(query, searchDocument, entry);
        double supportScore = broadQuery ? computeHighValueSupportScore(entry, supportTerms) : 0.0d;
        lexicalScore = Math.max(lexicalScore, supportScore);
        double semanticScore = 0.0d;

        if (queryEmbedding.isPresent()) {
            Optional<double[]> entryEmbedding = entrySemanticIndexService.ensureEmbedding(entry);
            if (entryEmbedding.isPresent()) {
                semanticScore = cosineSimilarity(queryEmbedding.get(), entryEmbedding.get());
            }
        }

        if (queryEmbedding.isPresent()
            && shouldRejectSemanticCandidate(entry, query, lexicalScore, semanticScore, broadQuery, supportTerms, supportScore)) {
            semanticScore = 0.0d;
        }

        double hybridScore = applySupportBoost(
            blendSearchScores(lexicalScore, semanticScore, query, entry),
            supportScore,
            broadQuery
        );

        return new SearchMatch(entry, lexicalScore, semanticScore, hybridScore, supportScore);
    }

    private double computeLexicalScore(String query, String searchDocument, Entry entry) {
        String normalizedQuery = normalizeForSearch(query);
        if (!StringUtils.hasText(normalizedQuery) || !StringUtils.hasText(searchDocument)) {
            return 0.0d;
        }

        String normalizedDocument = normalizeForSearch(searchDocument);
        String normalizedTitle = normalizeForSearch(entry.getTitle());
        Set<String> queryTokens = tokenize(normalizedQuery);
        boolean broadQuery = isBroadSemanticQuery(query);
        Set<String> supportTerms = buildQuerySupportTerms(query, broadQuery);
        double tagScore = computeTagSupportScore(entry, normalizedQuery, queryTokens, supportTerms, broadQuery);
        double noteScore = computeDocumentSupportScore(normalizedDocument, normalizedQuery, queryTokens, supportTerms, broadQuery);
        double titleScore = computeTitleSupportScore(normalizedTitle, normalizedQuery, supportTerms, broadQuery);

        return Math.min(1.0d, (tagScore * 0.50d) + (noteScore * 0.32d) + (titleScore * 0.18d));
    }

    private Set<String> tokenize(String value) {
        return java.util.Arrays.stream(value.split("[^\\p{L}\\p{Nd}]+"))
            .map(String::trim)
            .filter(token -> token.length() >= 2)
            .collect(Collectors.toSet());
    }

    private boolean isBroadSemanticQuery(String query) {
        String normalizedQuery = normalizeForSearch(query);
        Set<String> queryTokens = tokenize(normalizedQuery);
        if (queryTokens.size() != 1) {
            return false;
        }
        return queryTokens.iterator().next().length() >= 5;
    }

    private String buildSemanticQuery(String query, boolean broadQuery) {
        Set<String> vectorTerms = buildVectorQueryTerms(query, broadQuery);
        if (vectorTerms.isEmpty()) {
            return query;
        }
        return String.join(" ", vectorTerms);
    }

    private Set<String> buildQuerySupportTerms(String query, boolean broadQuery) {
        String normalizedQuery = normalizeForSearch(query);
        LinkedHashMap<String, Boolean> terms = new LinkedHashMap<>();
        tokenize(normalizedQuery).forEach(token -> terms.put(token, Boolean.TRUE));

        if (broadQuery) {
            for (String token : tokenize(normalizedQuery)) {
                BROAD_QUERY_ALIASES.getOrDefault(token, List.of())
                    .stream()
                    .map(this::normalizeForSearch)
                    .filter(StringUtils::hasText)
                    .forEach(alias -> terms.put(alias, Boolean.TRUE));
            }
        }

        List<String> seedTerms = new ArrayList<>(terms.keySet());
        for (String seedTerm : seedTerms) {
            expandLexicalFamily(seedTerm).forEach(familyTerm -> terms.put(familyTerm, Boolean.TRUE));
        }

        return terms.keySet();
    }

    private Set<String> buildVectorQueryTerms(String query, boolean broadQuery) {
        String normalizedQuery = normalizeForSearch(query);
        LinkedHashMap<String, Boolean> terms = new LinkedHashMap<>();
        Set<String> queryTokens = tokenize(normalizedQuery);
        queryTokens.forEach(token -> terms.put(token, Boolean.TRUE));

        for (String token : queryTokens) {
            String familyRoot = findLexicalFamilyRoot(token);
            if (StringUtils.hasText(familyRoot)) {
                terms.put(familyRoot, Boolean.TRUE);
            }
        }

        Set<String> canonicalTopics = entrySemanticIndexService.extractCanonicalTopics(
            broadQuery ? String.join(" ", buildQuerySupportTerms(query, true)) : normalizedQuery
        );
        for (String canonicalTopic : canonicalTopics) {
            terms.put(canonicalTopic, Boolean.TRUE);
            VECTOR_TOPIC_TERMS.getOrDefault(canonicalTopic, List.of()).stream()
                .map(this::normalizeForSearch)
                .filter(StringUtils::hasText)
                .forEach(alias -> terms.put(alias, Boolean.TRUE));
        }

        return terms.keySet();
    }

    private Set<String> expandLexicalFamily(String token) {
        if (!StringUtils.hasText(token)) {
            return Set.of();
        }

        String normalizedToken = normalizeForSearch(token);
        LinkedHashMap<String, Boolean> relatedTerms = new LinkedHashMap<>();
        for (List<String> familyGroup : LEXICAL_FAMILY_GROUPS) {
            boolean belongsToGroup = familyGroup.stream()
                .map(this::normalizeForSearch)
                .anyMatch(normalizedToken::equals);
            if (!belongsToGroup) {
                continue;
            }

            familyGroup.stream()
                .map(this::normalizeForSearch)
                .filter(StringUtils::hasText)
                .forEach(term -> relatedTerms.put(term, Boolean.TRUE));
        }

        return relatedTerms.keySet();
    }

    private String findLexicalFamilyRoot(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }

        String normalizedToken = normalizeForSearch(token);
        for (List<String> familyGroup : LEXICAL_FAMILY_GROUPS) {
            List<String> normalizedGroup = familyGroup.stream()
                .map(this::normalizeForSearch)
                .filter(StringUtils::hasText)
                .toList();
            if (!normalizedGroup.contains(normalizedToken) || normalizedGroup.isEmpty()) {
                continue;
            }
            return normalizedGroup.get(0);
        }

        return normalizedToken;
    }

    private boolean hasTextualSupport(String normalizedQuery, String normalizedText) {
        if (!StringUtils.hasText(normalizedQuery) || !StringUtils.hasText(normalizedText)) {
            return false;
        }

        return normalizedText.contains(normalizedQuery)
            || tokenize(normalizedQuery).stream().anyMatch(token -> token.length() >= 4 && normalizedText.contains(token));
    }

    private boolean hasTextualSupport(Set<String> normalizedTerms, String normalizedText) {
        if (normalizedTerms == null || normalizedTerms.isEmpty() || !StringUtils.hasText(normalizedText)) {
            return false;
        }

        return normalizedTerms.stream()
            .filter(StringUtils::hasText)
            .anyMatch(term -> normalizedText.contains(term));
    }

    private boolean hasHighValueLexicalSupport(Entry entry, Set<String> supportTerms) {
        return computeHighValueSupportScore(entry, supportTerms) >= 0.16d;
    }

    private double computeHighValueSupportScore(Entry entry, Set<String> supportTerms) {
        if (entry == null || supportTerms == null || supportTerms.isEmpty()) {
            return 0.0d;
        }

        String normalizedQuery = String.join(" ", supportTerms);
        String normalizedTitle = normalizeForSearch(entry.getTitle());
        String normalizedDocument = normalizeForSearch(entrySemanticIndexService.buildSearchDocument(entry));
        Set<String> queryTokens = tokenize(normalizedQuery);

        double canonicalScore = computeCanonicalTopicScore(entry, supportTerms);
        double tagScore = computeTagSupportScore(entry, normalizedQuery, queryTokens, supportTerms, true);
        double noteScore = computeDocumentSupportScore(normalizedDocument, normalizedQuery, queryTokens, supportTerms, true);
        double titleScore = computeTitleSupportScore(normalizedTitle, normalizedQuery, supportTerms, true);

        return Math.min(
            1.0d,
            Math.max(canonicalScore, (tagScore * 0.52d) + (noteScore * 0.30d) + (titleScore * 0.18d))
        );
    }

    private double computeTagSupportScore(
        Entry entry,
        String normalizedQuery,
        Set<String> queryTokens,
        Set<String> supportTerms,
        boolean broadQuery
    ) {
        if (entry == null) {
            return 0.0d;
        }

        List<String> normalizedTags = entry.getTags().stream()
            .map(Tag::getName)
            .filter(StringUtils::hasText)
            .map(this::normalizeForSearch)
            .toList();
        if (normalizedTags.isEmpty()) {
            return 0.0d;
        }

        long directMatches = normalizedTags.stream()
            .filter(tagName -> tagName.contains(normalizedQuery)
                || queryTokens.stream().anyMatch(token -> token.length() >= 4 && tagName.contains(token))
                || (broadQuery && hasStrictTagSupport(supportTerms, tagName)))
            .count();

        double score = 0.0d;
        if (directMatches > 0) {
            score = Math.max(score, Math.min(1.0d, 0.68d + ((double) directMatches - 1.0d) * 0.12d));
        }

        Set<String> queryTopics = entrySemanticIndexService.extractCanonicalTopics(String.join(" ", supportTerms));
        Set<String> tagTopics = entrySemanticIndexService.extractCanonicalTopics(String.join(" ", normalizedTags));
        long topicOverlap = queryTopics.stream().filter(tagTopics::contains).count();
        if (topicOverlap > 0) {
            score = Math.max(score, Math.min(1.0d, 0.74d + ((double) topicOverlap - 1.0d) * 0.10d));
        }

        return Math.min(1.0d, score);
    }

    private double computeDocumentSupportScore(
        String normalizedDocument,
        String normalizedQuery,
        Set<String> queryTokens,
        Set<String> supportTerms,
        boolean broadQuery
    ) {
        if (!StringUtils.hasText(normalizedDocument) || !StringUtils.hasText(normalizedQuery)) {
            return 0.0d;
        }

        double score = 0.0d;
        if (normalizedDocument.contains(normalizedQuery)) {
            score += 0.52d;
        }

        long matchedTokens = queryTokens.stream()
            .filter(normalizedDocument::contains)
            .count();
        if (!queryTokens.isEmpty()) {
            score += Math.min(0.20d, (double) matchedTokens / (double) queryTokens.size() * 0.20d);
        }

        if (broadQuery) {
            long matchedSupportTerms = supportTerms.stream()
                .filter(StringUtils::hasText)
                .filter(term -> term.length() >= 4)
                .filter(normalizedDocument::contains)
                .count();
            if (matchedSupportTerms > 0) {
                score += Math.min(0.28d, matchedSupportTerms * 0.06d);
            }
        }

        return Math.min(1.0d, score);
    }

    private double computeTitleSupportScore(
        String normalizedTitle,
        String normalizedQuery,
        Set<String> supportTerms,
        boolean broadQuery
    ) {
        if (!StringUtils.hasText(normalizedTitle) || !StringUtils.hasText(normalizedQuery)) {
            return 0.0d;
        }

        if (normalizedTitle.contains(normalizedQuery)) {
            return 1.0d;
        }
        if (broadQuery && hasTextualSupport(supportTerms, normalizedTitle)) {
            return 0.72d;
        }
        return 0.0d;
    }

    private double computeCanonicalTopicScore(Entry entry, Set<String> supportTerms) {
        Set<String> queryTopics = entrySemanticIndexService.extractCanonicalTopics(String.join(" ", supportTerms));
        return computeCanonicalTopicScore(entry, queryTopics, true);
    }

    private double computeCanonicalTopicScore(Entry entry, Set<String> queryTopics, boolean alreadyCanonical) {
        if (queryTopics.isEmpty()) {
            return 0.0d;
        }

        Set<String> entryTopics = entrySemanticIndexService.extractCanonicalTopics(entry);
        if (entryTopics.isEmpty()) {
            return 0.0d;
        }

        long overlap = queryTopics.stream()
            .filter(entryTopics::contains)
            .count();
        if (overlap <= 0) {
            return 0.0d;
        }

        return Math.min(0.48d, 0.28d + ((double) overlap - 1.0d) * 0.08d);
    }

    private boolean hasStrictTagSupport(Set<String> supportTerms, String normalizedTag) {
        if (supportTerms == null || supportTerms.isEmpty() || !StringUtils.hasText(normalizedTag)) {
            return false;
        }

        Set<String> tagTokens = tokenize(normalizedTag);
        return supportTerms.stream()
            .filter(StringUtils::hasText)
            .filter(term -> term.length() >= 4)
            .anyMatch(term -> tagTokens.contains(term) || normalizedTag.equals(term));
    }

    private double computeConflictPenalty(Entry entry, Set<String> queryTopics, boolean broadQuery) {
        if (!broadQuery || entry == null || queryTopics == null || queryTopics.isEmpty()) {
            return 0.0d;
        }

        double entryPenalty = computeDomainConflictPenalty(entrySemanticIndexService.extractCanonicalTopics(entry), queryTopics, broadQuery);
        Set<String> tagTopics = entrySemanticIndexService.extractCanonicalTopics(
            entry.getTags().stream()
                .map(Tag::getName)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining(" "))
        );
        double tagPenalty = computeDomainConflictPenalty(tagTopics, queryTopics, broadQuery);
        return Math.min(0.62d, entryPenalty + (tagPenalty * 0.85d));
    }

    private double computeDomainConflictPenalty(Set<String> entryTopics, Set<String> queryTopics, boolean broadQuery) {
        if (!broadQuery || entryTopics == null || queryTopics == null || queryTopics.isEmpty()) {
            return 0.0d;
        }
        if (entryTopics.isEmpty() || queryTopics.stream().anyMatch(entryTopics::contains)) {
            return 0.0d;
        }

        Set<String> queryRoots = canonicalDomainRoots(queryTopics);
        Set<String> entryRoots = canonicalDomainRoots(entryTopics);
        if (queryRoots.isEmpty() || entryRoots.isEmpty() || queryRoots.stream().anyMatch(entryRoots::contains)) {
            return 0.0d;
        }

        return 0.34d;
    }

    private Set<String> canonicalDomainRoots(Set<String> topics) {
        if (topics == null || topics.isEmpty()) {
            return Set.of();
        }

        LinkedHashMap<String, Boolean> roots = new LinkedHashMap<>();
        for (String topic : topics) {
            if (!StringUtils.hasText(topic)) {
                continue;
            }

            switch (topic) {
                case "technology", "web", "frontend", "backend" -> roots.put("technology", Boolean.TRUE);
                case "food", "vegetable", "fruit" -> roots.put("food", Boolean.TRUE);
                case "travel" -> roots.put("travel", Boolean.TRUE);
                case "music" -> roots.put("music", Boolean.TRUE);
                default -> {
                }
            }
        }
        return roots.keySet();
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

    private record SearchMatch(Entry entry, double lexicalScore, double semanticScore, double hybridScore, double supportScore) {
        private boolean shouldInclude(boolean semanticEnabled, boolean broadQuery) {
            if (semanticEnabled) {
                if (broadQuery) {
                    return hybridScore >= 0.34d || lexicalScore >= 0.18d || semanticScore >= 0.50d;
                }
                return hybridScore >= 0.28d || lexicalScore >= 0.12d || semanticScore >= 0.38d;
            }
            return lexicalScore > 0.0d;
        }

        private java.time.Instant updatedAt() {
            return entry.getUpdateDate();
        }
    }

    private record SearchQueryContext(
        String rawQuery,
        String normalizedQuery,
        Set<String> queryTokens,
        Set<String> supportTerms,
        Set<String> canonicalTopics,
        boolean broadQuery
    ) {
    }

    private record SearchCandidate(
        Entry entry,
        double topicScore,
        double tagScore,
        double noteScore,
        double titleScore,
        double semanticScore,
        double conflictPenalty,
        int directTagMatches,
        Set<String> queryTopics,
        Set<String> tagTopics,
        double structuredScore,
        double finalScore
    ) {
    }

    private record QueryEmbeddings(double[] content, double[] focus) {
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

    private boolean shouldSkipAiRefresh(Entry entry) {
        if (entry == null || entry.getFlag() == null) {
            return false;
        }

        return entry.getFlag() == FlagEnum.TABLE;
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
