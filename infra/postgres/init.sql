-- One database per service. Services never read each other's tables.
-- Runs only on first start (empty data volume).
CREATE DATABASE property;
CREATE DATABASE reservation;
CREATE DATABASE payment;
CREATE DATABASE analytics;
CREATE DATABASE channel;
CREATE DATABASE housekeeping;
