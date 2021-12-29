var redis = require('redis');
var redisClient = redis.createClient({ host: 'localhost', port: 6379 });
import { Logs } from '../helpers/logs';
import { Database } from '../helpers/database';

export class Agm {

     options;
     config;
     logs;

     constructor(options) {
          this.options = options;
          this.config = require('../config/config')(options);
          this.logs = new Logs();
     }

     get = async (agmId) => {
          try {
               return new Promise((resolve, reject) => {
                    redisClient.get('agm', (error, response) => {
                         if (error == null) {
                              let agm = JSON.parse(response);
                              let details = {};
                              let foundInRedis = false;
                              if (agm != null) {
                                   for (let i = 0; i < agm.length; i++) {
                                        let item = agm[i];
                                        if (item.agmId == agmId) {
                                             details = item;
                                             foundInRedis = true;
                                             break;
                                        }
                                   }

                              }
                              if (!foundInRedis) {
                                   this.find(agmId, (response) => {
                                        resolve(response);
                                   });
                              } else {
                                   resolve(details);
                              }
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }



     start = async (agmId) => {
          try {
               return new Promise((resolve, reject) => {
                    redisClient.get('agm', function (error, response) {
                         if (error == null) {
                              let agm = JSON.parse(response);
                              for (let i = 0; i < agm.length; i++) {
                                   let item = agm[i];
                                   if (item.agmId == agmId) {
                                        item.isMeetingStarted = true;
                                        break;
                                   }
                              }
                              redisClient.set('agm', JSON.stringify(agm), function (error, response) {
                                   if (error == null) {
                                        resolve(true);
                                   }
                              });
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     end = async (agmId) => {
          try {
               return new Promise((resolve, reject) => {
                    redisClient.get('agm', function (error, response) {
                         if (error == null) {
                              let agm = JSON.parse(response);
                              for (let i = 0; i < agm.length; i++) {
                                   let item = agm[i];
                                   if (item.agmId == agmId) {
                                        item.isMeetingFinished = true;
                                        break;
                                   }
                              }
                              redisClient.set('agm', JSON.stringify(agm), function (error, response) {
                                   if (error == null) {
                                        resolve(true);
                                   }
                              });
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     startTimer = async (agmId) => {
          try {
               return new Promise((resolve, reject) => {
                    redisClient.get('agm', function (error, response) {
                         if (error == null) {
                              let agm = JSON.parse(response);
                              for (let i = 0; i < agm.length; i++) {
                                   let item = agm[i];
                                   if (item.agmId == agmId) {
                                        item.isTimerStarted = true;
                                        break;
                                   }
                              }
                              redisClient.set('agm', JSON.stringify(agm), function (error, response) {
                                   if (error == null) {
                                        resolve(true);
                                   }
                              });
                         }
                    });
               });
          } catch {
               this.logs.write('error', error);
          }

     }

     set = async (data) => {
          try {
               return new Promise((resolve, reject) => {
                    redisClient.get('agm', function (error, response) {
                         if (error == null) {
                              let found = false;
                              let agm = JSON.parse(response);
                              if (agm != null) {
                                   for (let i = 0; i < agm.length; i++) {
                                        let item = agm[i];
                                        if (item.agmId == data.agmId) {
                                             found = true;
                                             break;
                                        }
                                   }
                                   if (!found) {
                                        agm.push(data);
                                   }
                              } else {
                                   agm = [];
                                   agm.push(data);
                              }
                              redisClient.set('agm', JSON.stringify(agm), function (error, response) {
                                   if (error == null) {
                                        resolve(true);
                                   }
                              });
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     find = async (agmId, callback) => {
          this.logs.write('info', 'Getting AGM Details from database');
          let database = new Database(this.config.database);
          let qb = await database.connection();
          try {
               qb.select('e.total_share_value as totalShare, agm.date as startDate, agm.time as startTime')
                    .from('agm')
                    .join('estates as e', 'e.id = agm.estate_id and e.is_active = 1')
                    .where('agm.id = ' + agmId + ' and agm.is_active = 1');

               let result = await qb.get();
               let usageClass = await this.getUsageClass(agmId, qb);
               let trimmedUsageClass = [];
               usageClass.map(item => {
                    trimmedUsageClass.push(item.sp_usage_class.trim());
               });
               let data = {};
               if (result.length > 0) {
                    for (let i = 0; i < result.length; i++) {
                         let item = result[i];
                         data = {
                              'agmId': agmId,
                              'isMeetingStarted': false,
                              'isMeetingFinished': false,
                              'isTimerStarted': false,
                              'totalShares': item.totalShare,
                              'start': {
                                   'date': item.startDate,
                                   'time': item.startTime,
                                   'timer': 30 * 60 * 1000
                              },
                              'usageClass': trimmedUsageClass
                         }
                    }
                    this.set(data).then(() => {
                         callback(data);
                    });
               } else {
                    callback(data);
               }
          } catch (error) {
               this.logs.write('error', error);
          } finally {
               if (qb) {
                    qb.disconnect();
               }
          }
     }

     getUsageClass = async (agmId, qb) => {
          this.logs.write('info', 'Getting Usage Class Details from database');
          // let database = new Database(this.config.database);
          // let qb = await database.connection();
          try {
               qb.select("sp.sp_usage_class", false)
                    .from("sp")
                    .join("blocks as b", 'b.id = sp.block_id and b.is_active = 1')
                    .join("estates as e", 'e.id = b.estate_id and e.is_active = 1')
                    .join("agm", 'agm.estate_id = e.id and agm.is_active = 1')
                    .where('agm.id', agmId)
                    .group_by('sp_usage_class');
               let result = await qb.get();
               return result;
          } catch (error) {
               this.logs.write('error', error);
          } finally {
               // if (qb) {
               //      qb.release();
               // }
          }
     }
}