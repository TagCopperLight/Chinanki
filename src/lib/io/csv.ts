/** RFC 4180 subset: comma separated, optional double quotes, doubled quotes escape. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let hasContent = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    if (hasContent) rows.push(row);
    row = [];
    hasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      hasContent = true;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (char === ',') {
      endField();
      hasContent = true;
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      // Treat CRLF as a single terminator; a lone CR still ends the row.
      if (text[i + 1] !== '\n') endRow();
    } else {
      field += char;
      if (char.trim() !== '') hasContent = true;
    }
  }
  if (inQuotes) {
    throw new Error(
      `Unterminated quoted field starting in row ${rows.length + 1}: a closing " is missing`,
    );
  }
  endRow();
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) =>
          /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field,
        )
        .join(','),
    )
    .join('\n');
}
