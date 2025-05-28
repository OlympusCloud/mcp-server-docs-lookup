declare global {
  var testUtils: {
    delay(ms: number): Promise<void>;
    createMockRepository(): any;
    createMockDocument(): any;
    createMockChunk(): any;
  };
}

export {};