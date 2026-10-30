@minLength(3)
@maxLength(36)
param name string

// Cosmos DB
param cosdbaLocation string = resourceGroup().location
@allowed([
    'Standard'
])
param cosdbaAccountOfferType string = 'Standard'
param cosdbaAutomaticFailover bool = true
@allowed([
    'Strong'
    'BoundedStaleness'
    'Session'
    'ConsistentPrefix'
    'Eventual'
])
param cosdbaConsistencyLevel string = 'Session'
param cosdbaPrimaryRegion string = resourceGroup().location
param cosdbaEnableServerless bool = true
@allowed([
    'Local'
    'Zone'
    'Geo'
])
param cosdbaBackupStorageRedundancy string = 'Local'

// Azure Communication Services
@allowed([
    'Africa'
    'Asia Pacific'
    'Australia'
    'Brazil'
    'Canada'
    'Europe'
    'France'
    'Germany'
    'India'
    'Japan'
    'Korea'
    'United Kingdom'
    'United States'
])
param acsvcDataLocation string = 'United States'

// Static Web App
@allowed([
    'Central US'
    'East Asia'
    'East US 2'
    'West Europe'
    'West US 2'
])
param sttappLocation string = 'Central US'
param sttappSkuName string = 'Free'
param sttappAllowConfigFileUpdates bool = true
@allowed([
    'Disabled'
    'Enabled'
])
param sttappStagingEnvironmentPolicy string = 'Enabled'

module cosdba './cosmosDb.bicep' = {
    name: 'CosmosDB'
    params: {
        name: name
        cosdbaLocation: cosdbaLocation
        cosdbaAccountOfferType: cosdbaAccountOfferType
        cosdbaAutomaticFailover: cosdbaAutomaticFailover
        cosdbaConsistencyLevel: cosdbaConsistencyLevel
        cosdbaPrimaryRegion: cosdbaPrimaryRegion
        cosdbaEnableServerless: cosdbaEnableServerless
        cosdbaBackupStorageRedundancy: cosdbaBackupStorageRedundancy
    }
}

module acsvc './communicationServices.bicep' = {
    name: 'CommunicationServices'
    params: {
        name: name
        acsvcDataLocation: acsvcDataLocation
    }
}

module sttapp './staticWebApp.bicep' = {
    dependsOn: [cosdba, acsvc]
    name: 'StaticWebApp'
    params: {
        name: name
        sttappLocation: sttappLocation
        sttappSkuName: sttappSkuName
        sttappAllowConfigFileUpdates: sttappAllowConfigFileUpdates
        sttappStagingEnvironmentPolicy: sttappStagingEnvironmentPolicy
        acsvcConnectionString: acsResource.listKeys().primaryConnectionString
        cosdbaConnectionString: 'AccountEndpoint=${cosmosResource.properties.documentEndpoint};AccountKey=${cosmosResource.listKeys().primaryMasterKey};'
    }
}


resource acsResource 'Microsoft.Communication/communicationServices@2020-08-20' existing = {
  name: 'acsvc-${name}'
}
resource cosmosResource 'Microsoft.DocumentDB/databaseAccounts@2021-10-15' existing = {
  name: 'cosdba-${name}'
}
output staticWebAppName string = sttapp.outputs.name
output staticWebAppUrl string = sttapp.outputs.url
