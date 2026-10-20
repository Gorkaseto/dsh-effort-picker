/**
 * Host half of the dsh-effort-picker bundle.
 *
 * The plugin owns no Host state: the Client module composes existing Host
 * entry points only — `llm/listConfigurableProviders` and
 * `session/modelCatalog` to read the current model's provider family and
 * reasoning metadata, `settings/describe` + `settings/mutate` to declare
 * generic reasoning levels for a model that offers none, and
 * `session/selectModel` to submit the picked effort.
 */
export function apply() {}
