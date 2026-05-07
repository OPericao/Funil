UPDATE entries SET flag='RAW' WHERE flag IS NULL;
SELECT flag, COUNT(*) AS total FROM entries GROUP BY flag ORDER BY total DESC;