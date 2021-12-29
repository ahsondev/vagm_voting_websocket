const request = require('request');
var redis = require('redis');
var redisClient = redis.createClient({ host: 'localhost', port: 6379 });
import { Resolution } from './resolution'
import { Logs } from '../helpers/logs';
import { Database } from '../helpers/database';

redisClient.on('ready', function () {
     console.log("Redis is ready");
});

redisClient.on('error', function () {
     console.log("Error in Redis");
});


export class Client {

     error = "Something went wrong. Please try again after sometime.";
     options;
     config;
     currentUser;
     agm;
     logs;

     constructor(options) {
          this.options = options;
          this.config = require('../config/config')(options);
          this.logs = new Logs();
     }

     authorize = async (webinar, connectionId, callback) => {
          try {
               await this.getWebinarDetails(JSON.parse(webinar)).then((response) => {
                    if (response.status) {
                         let userDetails = response.result.data;

                         if (userDetails.proxy_shares.length > 0) {
                              userDetails.proxy_shares.forEach((item) => {
                                   item.share_value = parseInt(item.share_value);
                                   item.resolutions = [];
                              });
                         }
                         if (userDetails.user_shares.length > 0) {
                              userDetails.user_shares.forEach((item) => {
                                   item.share_value = parseInt(item.share_value);
                                   item.resolutions = [];
                              });
                         }

                         let connectionData = {
                              userId: userDetails.user_id,
                              role: userDetails.role,
                              agmId: userDetails.id,
                              token: userDetails.token,
                              code: userDetails.code,
                              nickname: userDetails.nickname,
                              userShares: userDetails.user_shares,
                              proxyShares: userDetails.proxy_shares,
                              connectionId: connectionId,
                              usageClass: userDetails.usage_classes,
                         };
                         (async () => {
                              await this.addConnectionData(connectionData, (authorize) => {
                                   let user = {
                                        'authorized': authorize,
                                        'details': userDetails,
                                        'message': 'Success'
                                   }
                                   callback(user);
                              });
                         })();
                    } else {
                         this.logs.write('info', response.message);
                         let user = {
                              'authorized': false,
                              'details': '',
                              'message': response.message
                         }
                         callback(user);
                    }
               });
          } catch (error) {
               this.logs.write('error', error);
               let user = {
                    'authorized': false,
                    'details': '',
                    'message': error
               }
               callback(user);
          }

     };

     addConnectionData = async (userProfile, callback) => {
          try {
               let nomination = {
                    'allowed': 0,
                    'given': 0,
                    'isNominated': false,
                    'nominatedBy': '',
                    'accepted': false,
                    'declined': false,
                    'class': '',
                    'withdraw': false
               };

               // await this.getNominationDetails(connectionData).then((response) => {
               //      if (response.status) {
               //           nomination.allowed = response.result.data.nominations_allowed
               //      }
               // });

               userProfile.nomination = nomination;

               if (userProfile.role == 'moderator') {
                    userProfile.moderator = {
                         isVotingManager: false,
                         callForVote: false,
                         callForProposerSeconder: false
                    }
               }
               this.currentUser = userProfile;
               this.agm = userProfile.agmId;

               if (userProfile.role != 'moderator') {
                    await this.getProxyOnResolution(userProfile, (profile) => {
                         (async () => {
                              await this.add(profile, (response) => {
                                   callback(response);
                              });
                         })();
                    });
               } else {
                    await this.add(userProfile, (response) => {
                         callback(response);
                    });
               }
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     add = async (userProfile, callback) => {
          try {
               redisClient.get('clients', (error, response) => {
                    let clients = JSON.parse(response);
                    if (clients != null) {
                         if (typeof clients[userProfile.agmId] === "undefined") {
                              clients[userProfile.agmId] = [];
                              clients[userProfile.agmId].push(userProfile);
                         } else {
                              let found = 0;
                              clients[userProfile.agmId].forEach((item, index) => {
                                   if (item.userId === userProfile.userId) {
                                        found = 1;
                                   }
                              });
                              if (found === 0) {
                                   clients[userProfile.agmId].push(userProfile);
                              }
                              this.currentUser = userProfile;
                              this.agm = userProfile.agmId;
                         }
                    } else {
                         clients = {};
                         clients[userProfile.agmId] = [];
                         clients[userProfile.agmId].push(userProfile);
                    }
                    (async () => {
                         await redisClient.set('clients', JSON.stringify(clients), (error, response) => {
                              if (error != null) {
                                   this.logs.write('error', 'Error Occured While User Adding Into Redis');
                                   callback(false);
                              } else {
                                   this.logs.write('info', 'User Added Into Redis');
                                   callback(true);
                              }

                         });
                    })();
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     get = async (agm) => {
          try {
               return new Promise(function (resolve) {
                    redisClient.get('clients', function (error, response) {
                         if (error == null) {
                              if (response != null) {
                                   resolve(JSON.parse(response)[[agm]]);
                              }
                         } else {
                              reject(error);
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     set = async (user) => {
          try {
               return new Promise(function (resolve, reject) {
                    redisClient.get('clients', function (error, response) {
                         let clients = JSON.parse(response);
                         clients[user.agmId].forEach((item, index) => {
                              if (item.userId == user.userId) {
                                   clients[user.agmId].splice(index, 1);
                                   clients[user.agmId].push(user);
                              }
                         });
                         redisClient.set('clients', JSON.stringify(clients), function (error, response) {
                              if (error == null) {
                                   resolve(true);
                              }
                         });
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }


     update = async (userData) => {
          await this.get(this.agm).then((clients) => {
               if (typeof clients != undefined) {
                    for (let i = 0; i < clients.length; i++) {
                         let item = clients[i];
                         if (item.userId == this.currentUser.userId) {
                              if (item.role == 'moderator') {
                                   if (typeof userData.profile.isVotingManager != 'undefined') {
                                        item['moderator'].isVotingManager = userData.profile.isVotingManager;
                                   }
                                   if (typeof userData.profile.callForVote != 'undefined') {
                                        item['moderator'].callForVote = userData.profile.callForVote;
                                   }
                                   if (typeof userData.profile.callForProposerSeconder != 'undefined') {
                                        item['moderator'].callForProposerSeconder = userData.profile.callForProposerSeconder;
                                   }
                              }
                              (async () => {
                                   await this.set(item);
                              })();
                              break;
                         }
                    }
               }
          });
     }

     nominate = async (user, callback) => {
          try {
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != 'undefined') {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              if (item.userId == user.nominatedByUserId) {
                                   item.nomination.isNominated = true;
                                   item.nomination.nominatedBy = user.nominatedByUserId;
                                   item.nomination.accepted = true;
                                   item.nomination.class = user.class;
                                   item.nomination.given++;
                                   (async () => {
                                        await this.set(item);
                                   })();
                              }
                         }
                    }
                    callback(clients);
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     acceptNomination = async (user, callback) => {
          try {
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != 'undefined') {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              if (item.userId == user.userId) {
                                   item.nomination.accepted = true;
                                   (async () => {
                                        await this.set(item);
                                   })();
                                   break;
                              }
                         }
                    }
                    callback(clients);
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     declineNomination = async (user) => {
          try {
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != 'undefined') {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              if (item.userId == user.userId) {
                                   item.nomination.declined = true;
                              }
                              (async () => {
                                   await this.set(item);
                              })();
                              break;
                         }
                    }
                    callback(clients);
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     withdraw = async (user, callback) => {
          try {
               // console.log(user);
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != 'undefined') {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              // console.dir(item, {depth : null});
                              if (item.userId == user.userId) {
                                   // console.log('Here');
                                   item.nomination.withdraw = true;
                                   (async () => {
                                        await this.set(item);
                                   })();
                                   break;
                              }
                         }
                    }
                    callback(clients);
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }
     }

     remove = async (userData, callback) => {
          try {
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != undefined) {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              if (item.userId == userData.userId) {
                                   clients.splice(index, 1);
                              }
                              (async () => {
                                   await this.set(item);
                              })();
                              break;
                         }
                    }
                    callback(clients);
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(false);
          }

     }

     isVotingManager = async (callback) => {
          let found = false;
          try {
               await this.get(this.agm).then((clients) => {
                    if (typeof clients != 'undefined') {
                         for (let i = 0; i < clients.length; i++) {
                              let item = clients[i];
                              if (item.userId == this.currentUser.userId) {
                                   if (item.role == 'moderator' && item['moderator'].isVotingManager == true) {
                                        found = true;
                                        break;
                                   }
                              }
                         }
                    }
               });
          } catch (error) {
               this.logs.write('error', error);
               callback(found);
          }
     }

     delete = async (connectionId) => {

     }

     deleteConnectionId = async connectionId => {
          this.delete(connectionId);
     };

     getProxyOnResolution = async (userProfile, callback) => {
          try {
               
               let proxySpIds = [];
               let userSpIds = [];
               if (userProfile.proxyShares.length > 0) {
                    userProfile.proxyShares.forEach((item) => {
                         proxySpIds.push(item.sp_id);
                    });
               }
               if (userProfile.userShares.length > 0) {
                    userProfile.userShares.forEach((item) => {
                         userSpIds.push(item.sp_id);
                    });
               }

               let resolution = new Resolution(this.options);
               let database = new Database(this.config.database);
               let qb = await database.connection();

               await resolution.get(userProfile, (resolutions) => {
                    if (typeof resolutions != 'undefined' && resolutions.pending.length > 0) {
                         try {
                              for (let i = 0; i < resolutions.pending.length; i++) {
                                   let item = resolutions.pending[i];
                                   qb.select("ard.agm_id as agmId, ard.estate_member_id, ard.decision_made_by, ard.decision,ard.sp_id, ard.resolution_id as resolutionId", false)
                                        .from('agm_resolution_decisions as ard')
                                        .where('ard.resolution_id', item.resolution_id)
                                        .where_in('ard.sp_id', proxySpIds);

                                   (async () => {
                                        let resultForProxy = await qb.get();
                                        if (resultForProxy.length > 0) {
                                             for (let a = 0; a < userProfile.proxyShares.length; a++) {
                                                  let profile = userProfile.proxyShares[a];
                                                  for (let b = 0; b < resultForProxy.length; b++) {
                                                       let proxy = resultForProxy[b];
                                                       if (profile.sp_id == proxy.sp_id) {
                                                            profile.resolutions.push(proxy);
                                                       }
                                                  }
                                             }
                                        }
                                        if (i == (resolutions.pending.length - 1)) {
                                             callback(userProfile);
                                        }
                                   })();
                              }
                         } catch (error) {
                              this.logs.write('error', error);
                              callback(userProfile);
                         } finally {
                              if (qb) {
                                   qb.disconnect();
                              }
                         }
                    } else {
                         if (qb) {
                              qb.disconnect();
                         }
                         callback(userProfile);
                    }
               });
          } catch (error) {
               if (qb) {
                    qb.disconnect();
               }
               this.logs.write('error', error);
          } 

     }

     getNominationDetails = async (connectionData) => {
          try {
               var options = {
                    'method': 'GET',
                    'url': this.config.apiUrl + 'nominateCouncilMember?agm_id=' + connectionData.agmId + '&estate_id=' + connectionData.estateId + '&estate_member_id=' + connectionData.estateMemberId,
                    'headers': {
                         'Authorization': 'Bearer ' + connectionData.token
                    }
               };
               return new Promise(function (resolve, reject) {
                    request(options, function (error, response) {
                         if (error) {
                              reject(new Error(error));
                         } else {
                              resolve(JSON.parse(response.body));
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     getWebinarDetails = async (webinar) => {
          try {
               var options = {
                    'method': 'GET',
                    'url': this.config.apiUrl + 'webinarDetails?code=' + webinar.code,
                    'headers': {
                         'Authorization': 'Bearer ' + webinar.token
                    }
               };
               return new Promise(function (resolve, reject) {
                    request(options, function (error, response) {
                         if (error) {
                              reject(new Error(error));
                         } else {
                              resolve(JSON.parse(response.body));
                         }
                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }
};
