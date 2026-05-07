package com.pisito.app.repository;

import com.pisito.app.model.Entry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface EntryRepository extends JpaRepository<Entry, Long> {

    List<Entry> findAllByUserIdOrderByCreateDateDesc(Long userId);

    Optional<Entry> findByIdAndUserId(Long id, Long userId);

    List<Entry> findAllByNotificationDateBetweenAndNotificationReminderSentAtIsNullAndUserEmailIsNotNull(
        Instant notificationDateStart,
        Instant notificationDateEnd
    );
}
