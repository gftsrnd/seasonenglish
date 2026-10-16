// Docker runtime images use NODE_ENV=production. UI tests must load React's test build instead.
process.env.NODE_ENV = "test";
