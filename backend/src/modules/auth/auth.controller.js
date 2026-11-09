export function createAuthController({ authService }) {
  const register = async (req, res) => {
    const user = await authService.register(req.body);

    return res.status(201).json({ user });
  };

  const login = async (req, res) => {
    const user = await authService.login(req.body);

    return res.status(200).json({ user });
  };

  return {
    register,
    login,
  };
}
