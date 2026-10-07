-- 005_input_file.sql
-- Nombre del archivo del que salio la minuta (PDF, DOCX o TXT), o NULL si se pego el texto.
ALTER TABLE projects ADD COLUMN input_filename TEXT;
