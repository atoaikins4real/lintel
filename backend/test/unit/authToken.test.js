// signToken must carry exactly the claims every data route scopes on —
// especially company_id (isolation) and is_platform_admin (operator rights),
// which must come from the signed token and never from a request body.
const jwt = require('jsonwebtoken');
const { signToken } = require('../../src/middleware/auth');

describe('signToken', () => {
  it('embeds identity, role, company_id and platform-admin flag', () => {
    const token = signToken({
      id: 'u1',
      email: 'a@b.test',
      name: 'Ada',
      role: 'manager',
      company_id: 'c1',
      is_platform_admin: true,
    });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded).toMatchObject({
      sub: 'u1',
      email: 'a@b.test',
      name: 'Ada',
      role: 'manager',
      company_id: 'c1',
      is_platform_admin: true,
    });
  });

  it('coerces is_platform_admin to a strict boolean (never a truthy string)', () => {
    const token = signToken({ id: 'u1', role: 'viewer', company_id: 'c1' }); // flag omitted
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.is_platform_admin).toBe(false);
  });

  it('sets a 7-day expiry', () => {
    const token = signToken({ id: 'u1', role: 'viewer', company_id: 'c1' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const sevenDays = 7 * 24 * 60 * 60;
    expect(decoded.exp - decoded.iat).toBe(sevenDays);
  });

  it('produces a token that fails verification under a different secret', () => {
    const token = signToken({ id: 'u1', role: 'viewer', company_id: 'c1' });
    expect(() => jwt.verify(token, 'some-other-secret')).toThrow();
  });
});
