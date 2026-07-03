ALTER TABLE product_notification_configurations
ADD COLUMN default_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[30, 7, 1];
