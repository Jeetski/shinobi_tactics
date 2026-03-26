export function createHistory(initialState) {
  let past = [];
  let present = structuredClone(initialState);
  let future = [];

  return {
    get present() {
      return present;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    push(nextState) {
      past.push(structuredClone(present));
      present = structuredClone(nextState);
      future = [];
    },
    replace(nextState) {
      present = structuredClone(nextState);
    },
    undo() {
      if (!past.length) {
        return structuredClone(present);
      }
      future.unshift(structuredClone(present));
      present = past.pop();
      return structuredClone(present);
    },
    redo() {
      if (!future.length) {
        return structuredClone(present);
      }
      past.push(structuredClone(present));
      present = future.shift();
      return structuredClone(present);
    },
  };
}
