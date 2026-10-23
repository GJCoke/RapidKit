/** Preview simple Python-style fields as text; expressions and formatting stay unresolved. */
export function formatTemplateText(template: string, values: Record<string, string | number | boolean>) {
  const issues: string[] = []
  let text = "",
    index = 0
  while (index < template.length) {
    const character = template[index]!
    if (template.slice(index, index + 2) === "{{" || template.slice(index, index + 2) === "}}") {
      text += character
      index += 2
      continue
    }
    if (character !== "{") {
      if (character === "}") issues.push(character)
      text += character
      index++
      continue
    }
    let end = -1,
      depth = 1
    for (let cursor = index + 1; cursor < template.length; cursor++) {
      if (template[cursor] === "{") depth++
      if (template[cursor] === "}") depth--
      if (depth === 0) {
        end = cursor
        break
      }
    }
    const token = template.slice(index, end < 0 ? template.length : end + 1),
      name = template.slice(index + 1, end < 0 ? template.length : end)
    if (end < 0 || !/^[A-Za-z_]\w*$/.test(name)) {
      issues.push(token)
      text += token
    } else if (!Object.hasOwn(values, name)) {
      issues.push(name)
      text += token
    } else {
      const value = values[name]
      text += typeof value === "boolean" ? (value ? "True" : "False") : String(value)
    }
    index = end < 0 ? template.length : end + 1
  }
  return { text, issues }
}
