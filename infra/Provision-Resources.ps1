# Provisions resources
Param(
    [string]
    [Parameter(Mandatory=$false)]
    $ResourceGroupName = "",

    [string]
    [Parameter(Mandatory=$false)]
    $ResourceName = "",

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Australia Central", "Australia East", "Australia Southeast", "Brazil South", "Canada Central", "Canada East", "Central India", "Central US", "East Asia", "East US", "East US 2", "France Central", "Germany West Central", "Japan East", "Japan West", "Jio India West", "Korea Central", "Korea South", "North Central US", "North Europe", "Norway East", "South Africa North", "South Central US", "South India", "Southeast Asia", "Sweden Central", "Switzerland North", "UAE North", "UK South", "UK West", "West Central US", "West Europe", "West India", "West US", "West US 2", "West US 3")]
    $Location = "West US",

    ### Cosmos DB ###
    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Standard")]
    $CosmosDbAccountOfferType = "Standard",

    [bool]
    [Parameter(Mandatory=$false)]
    $CosmosDbAutomaticFailover = $true,

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Strong", "BoundedStaleness", "Session", "ConsistentPrefix", "Eventual")]
    $CosmosDbConsistencyLevel = "Session",

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Australia Central", "Australia East", "Australia Southeast", "Brazil South", "Canada Central", "Canada East", "Central India", "Central US", "East Asia", "East US", "East US 2", "France Central", "Germany West Central", "Japan East", "Japan West", "Jio India West", "Korea Central", "Korea South", "North Central US", "North Europe", "Norway East", "South Africa North", "South Central US", "South India", "Southeast Asia", "Sweden Central", "Switzerland North", "UAE North", "UK South", "UK West", "West Central US", "West Europe", "West India", "West US", "West US 2", "West US 3")]
    $CosmosDbPrimaryRegion = "West US",

    [bool]
    [Parameter(Mandatory=$false)]
    $CosmosDbEnableServerless = $true,

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Local", "Zone", "Geo")]
    $CosmosDbBackupStorageRedundancy = "Local",
    ### Cosmos DB ###

    ### Communication Services ###
    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Africa", "Asia Pacific", "Australia", "Brazil", "Canada", "Europe", "France", "Germany", "India", "Japan", "Korea", "United Kingdom", "United States")]
    $CommunicationServiceDataLocation = "United States",
    ### Communication Services ###

    ### Static Web App ###
    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Central US", "East Asia", "East US 2", "West Europe", "West US 2")]
    $StaticWebAppLocation = "Central US",

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Free", "Standard")]
    $StaticWebAppSkuName = "Free",

    [bool]
    [Parameter(Mandatory=$false)]
    $StaticWebAppAllowConfigFileUpdates = $true,

    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("Disabled", "Enabled")]
    $StaticWebAppStagingEnvironmentPolicy = "Enabled",
    ### Static Web App ###

    ### Target Scope ###
    [string]
    [Parameter(Mandatory=$false)]
    [ValidateSet("ResourceGroup", "Subscription")]
    $TargetScope = "Subscription",
    ### Target Scope ###

    [switch]
    [Parameter(Mandatory=$false)]
    $WhatIf,

    [switch]
    [Parameter(Mandatory=$false)]
    $Help
)

function Show-Usage {
    Write-Output "    This provisions resources to Azure

    Usage: $(Split-Path $MyInvocation.ScriptName -Leaf) ``
            -ResourceGroupName <resource group name> ``
            -ResourceName <resource name> ``
            [-Location <location>] ``

            [-CosmosDbAccountOfferType <Cosmos DB account type>] ``
            [-CosmosDbAutomaticFailover <`$true|`$false>] ``
            [-CosmosDbConsistencyLevel <Cosmos DB consistency level>] ``
            [-CosmosDbPrimaryRegion <Cosmos DB primary region>] ``
            [-CosmosDbEnableServerless <`$true|`$false>] ``
            [-CosmosDbBackupStorageRedundancy <Cosmos DB backup storage redundancy>] ``

            [-CommunicationServiceDataLocation <Data location for Communication Services> ``

            [-StaticWebAppLocation <Static Web App location>] ``
            [-StaticWebAppSkuName <Static Web App SKU name>] ``
            [-StaticWebAppAllowConfigFileUpdates <`$true|`$false>] ``
            [-StaticWebAppStagingEnvironmentPolicy <Static Web App staging envronment policy>] ``

            [-TargetScope <Target scope>] ``

            [-WhatIf] ``
            [-Help]

    Options:
        -ResourceGroupName                Resource group name.
                                          Default is empty string.
                                          But if -TargetScope is ResourceGroup,
                                          it must be specified.
        -ResourceName                     Resource name.
        -Location                         Resource location.
                                          Default is 'West US'.

        -CosmosDbAccountOfferType         Cosmos DB account type.
                                          Default is 'Standard'.
        -CosmosDbAutomaticFailover        To enable failover or not.
                                          Default is `$true.
        -CosmosDbConsistencyLevel         Cosmos DB consistency level.
                                          Default is 'Session'.
        -CosmosDbPrimaryRegion            Cosmos DB primary region.
                                          Default is 'West US'.
        -CosmosDbEnableServerless         To enable serverless or not.
                                          Default is `$true.
        -CosmosDbBackupStorageRedundancy  Cosmos DB backup storage redundancy.
                                          Default is 'Local'.

        -CommunicationServiceDataLocation Data location for Communication Services.
                                          Default is 'United States'.

        -StaticWebAppLocation             Static Web App location.
                                          Default is 'Central US'.
        -StaticWebAppSkuName              Static Web App SKU name.
                                          Default is 'Free'.
        -StaticWebAppAllowConfigFileUpdates
                                          To allow config file update or not.
                                          Default is `$true.
        -StaticWebAppStagingEnvironmentPolicy
                                          Staging environment policy.
                                          Default is 'Enabled'.

        -WhatIf:                          Show what would happen without
                                          actually provisioning resources.
        -Help:                            Show this message.
"

    Exit 0
}

# Show usage
$needHelp = ($ResourceName -eq "") -or ($Help -eq $true)
if ($needHelp -eq $true) {
    Show-Usage
    Exit 0
}

$needHelp = ($TargetScope -eq "ResourceGroup") -and ($ResourceGroupName -eq "")
if ($needHelp -eq $true) {
    Show-Usage
    Exit 0
}

# Build parameters
$params = @{
    name = @{ value = $ResourceName };

    cosdbaAccountOfferType = @{ value = $CosmosDbAccountOfferType };
    cosdbaAutomaticFailover = @{ value = $CosmosDbAutomaticFailover };
    cosdbaConsistencyLevel = @{ value = $CosmosDbConsistencyLevel };
    cosdbaPrimaryRegion = @{ value = $CosmosDbPrimaryRegion };
    cosdbaEnableServerless = @{ value = $CosmosDbEnableServerless };
    cosdbaBackupStorageRedundancy = @{ value = $CosmosDbBackupStorageRedundancy };

    acsvcDataLocation = @{ value = $CommunicationServiceDataLocation };

    sttappLocation = @{ value = $StaticWebAppLocation };
    sttappSkuName = @{ value = $StaticWebAppSkuName };
    sttappAllowConfigFileUpdates = @{ value = $StaticWebAppAllowConfigFileUpdates };
    sttappStagingEnvironmentPolicy = @{ value = $StaticWebAppStagingEnvironmentPolicy };
}

if ($TargetScope -eq "ResourceGroup") {
    $params.cosdbaLocation = @{ value = $Location };
} else {
    $params.location = @{ value = $Location };
}

# Use a parameter file to avoid shell-dependent JSON quoting.
$parameterFile = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.json')
try {
    $params | ConvertTo-Json -Depth 10 | Set-Content -Path $parameterFile -Encoding utf8
    $operation = if ($WhatIf) { 'what-if' } else { 'create' }
    if ($TargetScope -eq 'ResourceGroup') {
        $result = az deployment group $operation --resource-group $ResourceGroupName --name $TargetScope `
            --template-file "$PSScriptRoot/main.bicep" --parameters "@$parameterFile"
    } else {
        $result = az deployment sub $operation --location $Location --name $TargetScope `
            --template-file "$PSScriptRoot/azuredeploy.bicep" --parameters "@$parameterFile"
    }
    if ($LASTEXITCODE -ne 0) { throw "Azure deployment command failed with exit code $LASTEXITCODE" }
    $result
} finally {
    Remove-Item -Path $parameterFile -Force -ErrorAction SilentlyContinue
}
