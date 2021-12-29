let pusherConfig = {
     app_id: "1046031",
     key: "ca0562de2cda5d22ec7b",
     secret: "2770800d9e640a8e6d66",
     cluster: "ap1"
}
var config = {
     vagm: {
          staging: {
               database: {
                    host: 'propyoda-dev.cjzjp5nll7qh.ap-southeast-1.rds.amazonaws.com',
                    user: 'propyoda_admin',
                    password: 'y55zyTrh5XdT2WCd',
                    database: 'mcst_staging'
               },
               authTokenExpiry: "32400", //9hrs
               saveLogs: 1,
               webinarWaitPeriod: "1800", //30 min
               pusherConfig: pusherConfig,
               apiUrl: 'https://stagemcstapis.propyoda.com/admin/v1/',
               dynamoTableName: 'voting_staging',
               connectCounter : 0
          },
          production: {
               database: {
                    host: 'vagm-prod.cluster-ro-cjzjp5nll7qh.ap-southeast-1.rds.amazonaws.com',
                    user: 'be48VICmAy',
                    password: '7M2EftIsaZRCUu1G7ob',
                    database: 'mcst_prod'
               },
               authTokenExpiry: "32400", //9hrs
               saveLogs: 0,
               webinarWaitPeriod: "1800", //30 min
               pusherConfig: pusherConfig,
               apiUrl: 'https://mcstapis.propyoda.com/admin/v1/',
               dynamoTableName: 'voting_prod',
               connectCounter : 0
          },
          development: {
               database: {
                    host: "localhost",
                    user: "root",
                    password: "root",
                    database: "mcst_test"
               },
               authTokenExpiry: "32400", //9hrs
               saveLogs: 1,
               webinarWaitPeriod: "1800", //30 min
               pusherConfig: pusherConfig,
               apiUrl: 'http://localhost/vagm/api/www/index.php/admin/v1/',
               dynamoTableName: 'voting_staging',
               connectCounter : 0
          }
     }
};

module.exports = function (options) {
     var app = options.app;
     var environment = options.environment;
     return config[app][environment];
};


