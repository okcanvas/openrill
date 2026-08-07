function contains(text, token) {
  return typeof text === "string" && text.includes(token);
}

export function evaluateLiveOutputPrivacy({ secret, prompts, transientOutputs, authorizedHistoryOutputs }) {
  const allOutputs = [...transientOutputs, ...authorizedHistoryOutputs];
  return {
    secretRedacted: allOutputs.every((text) => !contains(text, secret)),
    promptsNotEchoedOutsideHistory: prompts.every((prompt) => transientOutputs.every((text) => !contains(text, prompt))),
    authorizedHistoryContainsPrompts: prompts.every((prompt) => authorizedHistoryOutputs.some((text) => contains(text, prompt))),
  };
}
