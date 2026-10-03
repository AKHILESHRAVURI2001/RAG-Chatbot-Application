export interface EmbeddingProvider {
  name: string;
  isConfigured(): boolean;
  embedText(text: string, model: string): Promise<number[]>;
  embedBatch(texts: string[], model: string): Promise<number[][]>;
  warmup?(): Promise<void>;
}
