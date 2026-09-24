export function airtableSessionKind(
  workTypeName: string,
): "pt" | "miit" | "group" | null {
  const name = workTypeName.toLowerCase();
  if (name.includes("group")) {
    return "group";
  }
  if (name.includes("miit")) {
    return "miit";
  }
  if (name.includes("pt") || name.includes("personal")) {
    return "pt";
  }
  return null;
}
