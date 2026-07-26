// `npm:pkg@version` specifiers are resolved at runtime by tsxmts's own
// resolve hook — tsc has no way to know their real types ahead of time.
declare module 'npm:*';
