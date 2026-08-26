// Two in-company roles only: manager (Admin) and finance (Member). The
// read-only viewer role was retired — it can no longer be assigned.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => fake.reset());

const admin = () => bearer({ role: 'manager', company_id: 'c1', id: 'admin-1' });

describe('PATCH /api/auth/users/:id role assignment', () => {
  it('rejects assigning the retired "viewer" role (400)', async () => {
    const res = await request(app).patch('/api/auth/users/u2').set('Authorization', admin()).send({ role: 'viewer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/manager.*finance|role must be one of/i);
  });

  it('rejects any unknown role (400)', async () => {
    const res = await request(app).patch('/api/auth/users/u2').set('Authorization', admin()).send({ role: 'member' });
    expect(res.status).toBe(400);
  });

  it('accepts Member (finance)', async () => {
    fake.table('l_users', (ctx) =>
      ctx.method === 'update' ? { data: { id: 'u2', role: 'finance' } } : { data: { session_valid_from: null } }
    );
    const res = await request(app).patch('/api/auth/users/u2').set('Authorization', admin()).send({ role: 'finance' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('finance');
  });

  it('accepts Admin (manager)', async () => {
    fake.table('l_users', (ctx) =>
      ctx.method === 'update' ? { data: { id: 'u2', role: 'manager' } } : { data: { session_valid_from: null } }
    );
    const res = await request(app).patch('/api/auth/users/u2').set('Authorization', admin()).send({ role: 'manager' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('manager');
  });
});
