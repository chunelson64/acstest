import { CommunicationIdentityClient } from '@azure/communication-identity';
import { CosmosClient } from '@azure/cosmos';
import { hasStatus, type IdentityRecord, type Services } from './users';

let services: Services | undefined;

export function getServices(): Services {
  if (services) return services;
  const acsConnection = process.env.ACS_ConnectionString;
  const cosmosConnection = process.env.MyAccount_COSMOSDB;
  if (!acsConnection || !cosmosConnection) throw new Error('Missing service configuration.');
  const identity = new CommunicationIdentityClient(acsConnection);
  const container = new CosmosClient(cosmosConnection).database('ACS').container('users');
  services = {
    async find(id) {
      try {
        const { resource } = await container.item(id, id).read<IdentityRecord>();
        return resource;
      } catch (error) {
        if (hasStatus(error, 404)) return undefined;
        throw error;
      }
    },
    async create(record) { await container.items.create(record); },
    async createUser() { return (await identity.createUser()).communicationUserId; },
    async deleteUser(userId) { await identity.deleteUser({ communicationUserId: userId }); },
    async getToken(userId) {
      return identity.getToken({ communicationUserId: userId }, ['voip'], { tokenExpiresInMinutes: 60 });
    }
  };
  return services;
}
