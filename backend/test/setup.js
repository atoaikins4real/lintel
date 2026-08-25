// Runs before any test module is imported. Several source modules read
// environment at require-time (middleware/auth reads JWT_SECRET into a
// closure the moment it loads), so these must be set here rather than
// inside a test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'GHS';

// Harmless dummy credentials. createClient() validates the URL shape at
// construction time and throws without one, and several "pure" modules
// (currency, subscription) transitively require config/supabase. These
// values let the client be constructed but it never actually connects: the
// unit tests trigger no query, and the integration tests replace the whole
// module via vi.mock. Deliberately NOT a real project.
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// No mail provider configured => mailer logs instead of sending. Silence the
// log lines so they don't clutter the reporter.
process.env.MAIL_PROVIDER = '';
