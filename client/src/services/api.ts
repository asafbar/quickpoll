export interface HealthResponse {
  status: string;
  service: string;
}

const API_BASE_URL = "http://localhost:3001/api";

export async function getServerHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}