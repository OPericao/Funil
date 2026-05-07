package com.pisito.app.service;

import com.pisito.app.model.Entry;
import com.pisito.app.repository.EntryRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class NotificationReminderService {

    private static final Logger log = LoggerFactory.getLogger(NotificationReminderService.class);

    private final EntryRepository entryRepository;
    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final String fromName;

    public NotificationReminderService(
        EntryRepository entryRepository,
        JavaMailSender mailSender,
        @Value("${app.mail.from-email:}") String fromEmail,
        @Value("${app.mail.from-name:Funil}") String fromName
    ) {
        this.entryRepository = entryRepository;
        this.mailSender = mailSender;
        this.fromEmail = fromEmail;
        this.fromName = fromName;
    }

    @Scheduled(cron = "${app.reminders.cron:0 0 * * * *}")
    @Transactional
    public void sendOneDayReminderEmails() {
        Instant now = Instant.now();
        Instant start = now.plus(Duration.ofHours(24));
        Instant end = now.plus(Duration.ofHours(25));
        List<Entry> upcomingEntries = entryRepository
            .findAllByNotificationDateBetweenAndNotificationReminderSentAtIsNullAndUserEmailIsNotNull(start, end);

        if (upcomingEntries.isEmpty()) {
            return;
        }

        for (Entry entry : upcomingEntries) {
            if (!StringUtils.hasText(entry.getUser().getEmail()) || entry.getNotificationDate() == null) {
                continue;
            }

            try {
                sendReminderEmail(entry);
                entry.setNotificationReminderSentAt(Instant.now());
            } catch (MailException | MessagingException ex) {
                log.warn("Could not send reminder email for entryId={}", entry.getId(), ex);
            }
        }
    }

    private void sendReminderEmail(Entry entry) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");

        String toEmail = entry.getUser().getEmail();
        String subject = "Recordatorio de nota: " + entry.getTitle();
        String formattedDate = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(ZoneId.of("UTC"))
            .format(entry.getNotificationDate());

        helper.setTo(toEmail);
        if (StringUtils.hasText(fromEmail)) {
            helper.setFrom(fromEmail);
        }
        helper.setSubject(subject);
        helper.setText(
            "Hola,\n\n"
                + "Tu nota \"" + entry.getTitle() + "\" tiene alarma para " + formattedDate + " UTC.\n"
                + "Este es un recordatorio enviado 1 dia antes.\n\n"
                + "Funil",
            false
        );

        mailSender.send(message);
    }
}
