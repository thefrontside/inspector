import { createContext, type Operation, type Scope, useScope } from "effection";

export type Attributes = { name: string } & Record<string, string | number | boolean>;

export const AttributesContext = createContext<Attributes>("@effection/attributes", {
  name: "anonymous",
});

export function* useAttributes(attributes: Partial<Attributes>): Operation<void> {
  let scope = yield* useScope();
  let current = scope.hasOwn(AttributesContext)
    ? scope.expect(AttributesContext)
    : AttributesContext.defaultValue!;
  scope.set(AttributesContext, { ...current, ...attributes });
}

export function getLabels(scope: Scope) {
  if (scope.hasOwn(AttributesContext)) {
    return scope.expect(AttributesContext);
  }
  return AttributesContext.defaultValue!;
}
