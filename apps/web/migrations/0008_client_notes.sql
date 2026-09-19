-- Add notes column to clients table to match the ClientSchema Zod definition.
ALTER TABLE clients ADD COLUMN notes TEXT;
