import { app } from '@azure/functions';
import { createUsersHandler } from './users';
import { getServices } from './services';

app.http('users', {
  route: 'users/me',
  methods: ['POST'],
  authLevel: 'anonymous', // SWA gateway + handler enforce authentication and the acs-user role.
  handler: createUsersHandler(getServices)
});
