// Controller: translates between HTTP (req, res) and the service. It never runs SQL.
export function createHealthController({ healthService }) {
  return {
    async getHealth(req, res) {
      const status = await healthService.getStatus();

      res.json(status);
    },
  };
}
