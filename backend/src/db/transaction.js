// Runs "callback" inside a database transaction: everything it does is saved together
// (COMMIT) or undone together (ROLLBACK).

//basically the function exceture all operations in postgres, if one of them fails undoes everything
export async function withTransaction(pool, callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
