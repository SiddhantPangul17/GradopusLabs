/** Reads a text field from FormData, ignoring files and capping length. */
export function readFormText(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}
