// Service: the use case. It decides what to do and knows nothing about Express.
export function createHealthService({ healthRepository }) {
  return {
    async getStatus() {
      await healthRepository.ping();

      return { status: 'ok' };
    },
  };
}
