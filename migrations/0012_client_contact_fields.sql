-- Add contact detail columns to clients so the client detail page can store
-- email, phone, and a free-form address alongside the existing notes.
ALTER TABLE clients ADD COLUMN email TEXT;
ALTER TABLE clients ADD COLUMN phone TEXT;
ALTER TABLE clients ADD COLUMN address TEXT;
