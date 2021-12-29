const redis = require('redis');
const redisClient = redis.createClient({ host: 'localhost', port: 6379 });
import { Logs } from '../helpers/logs';
import { Database } from '../helpers/database';

export class Resolution {

     options;
     config;
     ddb;
     logs;


     constructor(options) {
          this.options = options;
          this.config = require('../config/config')(options);
          this.logs = new Logs();
     }


     isKeyExistInRedis = async (callback) => {
          try {
               await redisClient.exists('resolutions', function (error, exists) {
                    if (exists == 1) {
                         callback(true);
                    } else {
                         callback(false);
                    }
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     isFoundInRedis = async (user, callback) => {
          try {
               await redisClient.get('resolutions', function (error, response) {
                    if (error) {
                         callback(error);
                    } else if (response != null) {
                         callback(JSON.parse(response)[user.agmId]);
                    } else {
                         callback(false);
                    }
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     isFoundInDynamoDb = async (user, callback) => {
          var dynamoDbTableName = this.config.dynamoTableName;
          var dynamo = this.ddb;
          var params = {
               TableName: dynamoDbTableName,
               Key: {
                    'key': { S: 'resolutions' }
               }
          };
          dynamo.getItem(params, (err, data) => {
               if (err) {
                    callback(false);
               } else {
                    let dynamoData = JSON.parse(data.Item.value.S);
                    if (typeof dynamoData[user.agmId] === "undefined") {
                         callback(false);
                    } else {
                         (async () => {
                              await this.set(dynamoData[user.agmId], user);
                              callback(dynamoData[user.agmId]);
                         })();
                    }
               }
          });
     }

     get = async (user, callback) => {
          try {
               await this.isKeyExistInRedis((exists) => {
                    if (exists) {
                         this.isFoundInRedis(user, (resolutions) => {
                              if (typeof resolutions != 'undefined') {
                                   callback(resolutions);
                              } else {
                                   this.find(user, (resolutions) => {
                                        callback(resolutions)
                                   });
                              }
                         });
                    } else {
                         this.find(user, (resolutions) => {
                              callback(resolutions)
                         });
                    }
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     };

     set = async (resolution, user) => {
          try {
               redisClient.get('resolutions', function (error, response) {
                    let resolutions = JSON.parse(response);
                    if (resolutions != null) {
                         resolutions[user.agmId] = resolution;
                    } else {
                         resolutions = {};
                         resolutions[user.agmId] = resolution;
                    }
                    redisClient.set('resolutions', JSON.stringify(resolutions));
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     find = async (user, callback) => {
          this.logs.write('info', 'Getting Resolutions From Database');
          let database = new Database(this.config.database);
          let qb = await database.connection();
          let resolutionObject = {
               'pending': [],
               'active': [],
               'decided': []
          };
          try {

               qb.select("ar.id as resolution_id, ar.agm_id as agmId, ar.resolution_no, ar.resolution_heading, ar.resolution_text, ar.resolution_proposer, ar.resolution_seconder ,ar.proxy_allowed_to_vote, art.proxy_vote_allowed, art.resolution_type, art.resolution_category, art.objection_feasibility,art.id as resolution_type_id, art.pending_dues_vote_allowed, art.decision_calculation_type, art.decision_at_agm, art.decision_threshold_percentage")
                    .from("agm_resolutions as ar")
                    .join("agm_resolution_types as art", 'art.id = ar.resolution_type_id and art.is_active = 1')
                    .where('ar.agm_id', user.agmId)
                    .where('ar.is_active', 1);

               let resolutions = await qb.get();
               let preNominatedMembers = await this.getPreNominatedMembers(user, qb);

               if (resolutions.length > 0) {

                    for (let i = 0; i < resolutions.length; i++) {
                         resolutions[i].total_decision = 0;
                         resolutions[i].decision = '';
                         resolutions[i].total_votes_received = 0;
                         resolutions[i].total_votes_for = 0;
                         resolutions[i].total_votes_against = 0;
                         resolutions[i].total_votes_abstain = 0;
                         resolutions[i].total_share_for = 0;
                         resolutions[i].total_share_against = 0;
                         resolutions[i].total_share_abstain = 0;
                         resolutions[i].percentage = 0;
                         resolutions[i].decisionBasedOn = '';
                         resolutions[i].isActive = false;
                         resolutions[i].isPending = true;
                         resolutions[i].isDecided = false;
                         resolutions[i].isVotingStarted = false;
                         resolutions[i].isVotingFinished = false;
                         resolutions[i].isTimerStarted = false;
                         resolutions[i].isTimerFinished = false;
                         resolutions[i].isResultPublished = false;
                         resolutions[i].goForVote = false;
                         resolutions[i].goForPole = false;
                         resolutions[i].createdAtAgm = false;
                         resolutions[i].votedUsers = [];
                         resolutions[i].usersHavingObjection = [];

                         if (parseInt(resolutions[i].resolution_type_id) == 3) {
                              resolutions[i].nominated = {
                                   'pre': preNominatedMembers,
                                   'new': []
                              }
                         }
                         if (parseInt(resolutions[i].resolution_type_id) == 4) {
                              resolutions[i].minCouncilMember = 3;
                              resolutions[i].maxCouncilMember = 14;
                              resolutions[i].approvedCouncilMember = 0;
                              resolutions[i].responseOnNumberOfCouncilMember = [];
                              resolutions[i].votesOnOptions = [];
                         }

                         if (parseInt(resolutions[i].resolution_type_id) == 5) {
                              resolutions[i].electedCouncilMember = [];
                         }

                         resolutionObject['pending'].push(resolutions[i]);
                    }
                    await this.set(resolutionObject, user);
                    callback(resolutionObject);
               } else {
                    callback(resolutionObject);
               }
          } catch (error) {
               this.logs.write('error', error);
               callback(resolutionObject);
          } finally {
               if (qb) {
                    qb.disconnect();
               }
          }
     }

     getPreNominatedMembers = async (user, qb) => {
          this.logs.write('info', 'Getting Pre Nominated Members From Database');
          // let database = new Database(this.config.database);
          // let qb = await database.connection();
          try {
               qb.select("arn.on_behalf_sp_id as nominated_by_sp_id, arn.nominated_sp_id, arn.status, sp.sp_usage_class as class, arn.resolution_id, arn.decision_type, CONCAT(bb.block_no,'-',spp.floor_no,'-',spp.unit_no,'-',SUBSTRING_INDEX(spp.sp_name,' ',1)) as nominated_by_user_name, CONCAT(b.block_no,'-',sp.floor_no,'-',sp.unit_no,'-',SUBSTRING_INDEX(sp.sp_name,' ',1)) as nominated_user_name", false)
                    .from("agm_resolution_nominations as arn")
                    .join("sp", 'sp.id = arn.nominated_sp_id and sp.is_active = 1')
                    .join("blocks as b", 'b.id = sp.block_id and b.is_active = 1')
                    .join("sp as spp", 'spp.id = arn.on_behalf_sp_id and spp.is_active = 1')
                    .join("blocks as bb", 'bb.id = spp.block_id')
                    .where('arn.agm_id', user.agmId)
                    .where('arn.status', 'Accepted');
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

     startResolution = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.pending.length; i++) {
                         let item = resolutions.pending[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              item.isActive = true;
                              item.isPending = false;
                              resolutions.active.push(item);
                              resolutions.pending.splice(i, 1);
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     backToPending = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              item.isActive = false;
                              item.isPending = true;
                              resolutions.pending.push(item);
                              resolutions.active.splice(i, 1);
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     startResolutionVoting = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id == resolutionData.resolution_id) {
                              item.isVotingStarted = true;
                              if (item.resolution_type_id == 4) {
                                   item.votesOnOptions = resolutionData.votesOnOptions;
                              }
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }



     goForVote = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              if (!item.isVotingStarted) {
                                   item.isVotingStarted = true;
                              }
                              item.goForVote = true;
                              item.isTimerFinished = false;
                              item.isTimerStarted = false;
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     goForPole = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              if (!item.isVotingStarted) {
                                   item.isVotingStarted = true;
                              }
                              item.goForPole = true;
                              item.isTimerFinished = false;
                              item.isTimerStarted = false;
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     updateResolutionAnswer = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id == resolutionData.resolution_id) {

                              if (typeof resolutionData.Objection != 'undefined' && resolutionData.Objection) {
                                   let found = false;
                                   if (item.usersHavingObjection.length > 0) {
                                        for (let k = 0; k < item.usersHavingObjection.length; k++) {
                                             if (parseInt(item.usersHavingObjection[k].user.userId) == parseInt(resolutionData.user.userId)) {
                                                  found = true;
                                             }
                                        }
                                   }
                                   if (!found) {
                                        item.usersHavingObjection.push(resolutionData);
                                   }

                              } else {
                                   let found = false;
                                   if (item.votedUsers.length > 0) {
                                        for (let k = 0; k < item.votedUsers.length; k++) {
                                             if (parseInt(item.votedUsers[k].user.userId) == parseInt(resolutionData.user.userId)) {
                                                  found = true;
                                             }
                                        }
                                   }
                                   if (!found) {
                                        item.votedUsers.push(resolutionData);
                                   }
                              }

                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     updateResolutionTimer = async (resolutionData) => {
          try {
               let resolutions = this.allAgmResolutions[resolutionData.agmId].active;
               for (let i = 0; i < resolutions.length; i++) {
                    let item = resolutions[i];
                    if (item.resolution_id == resolutionData.resolution_id) {
                         item.isTimerStarted = resolutionData.isTimerStarted;
                         item.isTimerFinished = resolutionData.isTimerFinished;
                         break;
                    }
               }
               return true;
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     finishResolution = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              item.isVotingFinished = true;
                              item.isDecided = true;
                              item.isActive = false;
                              item.decision = resolutionData.decision;
                              resolutions.decided.push(item);
                              resolutions.active.splice(i, 1);
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     electAllNominated = async (resolution, callback) => {
          try {
               await this.get(resolution, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolution.resolution_id) {
                              item.isVotingFinished = true;
                              item.isDecided = true;
                              item.isActive = false;
                              item.decision = resolution.maxCouncilMember;
                              item.approvedCouncilMember = resolution.maxCouncilMember;
                              resolutions.decided.push(item);
                              resolutions.active.splice(i, 1);
                              resolutions.pending.forEach((pending, index) => {
                                   if (pending.resolution_type_id == 5) {
                                        resolutions.decided.forEach((decided) => {
                                             if (decided.resolution_type_id == 3) {
                                                  decided.nominated.pre.map(member => {
                                                       if(typeof member.withdraw == 'undefined') {
                                                            let temp = {
                                                                 'nickname': member.nominated_user_name,
                                                                 'count': 0
                                                            };
                                                            pending.electedCouncilMember.push(temp);
                                                       }
                                                  });

                                                  decided.nominated.new.map(member => {
                                                       if(!member.nomination.withdraw) {
                                                            let temp = {
                                                                 'nickname': member.nickname,
                                                                 'count': 0
                                                            };
                                                            pending.electedCouncilMember.push(temp);
                                                       }
                                                  });
                                             }
                                        });
                                        resolutions.decided.push(pending);
                                        resolutions.pending.splice(index, 1);
                                   }
                              });
                              this.set(resolutions, resolution);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     declareApproved = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id == resolutionData.resolution_id) {
                              if (item.resolution_type_id == 5) {
                                   for (let a = 0; a < resolutions.decided.length; a++) {
                                        let decided = resolutions.decided[a];
                                        if (decided.resolution_type_id == 3) {
                                             decided.nominated.pre.map(member => {
                                                  if(typeof member.withdraw == 'undefined') {
                                                       let match = false;
                                                       item.electedCouncilMember.map(elected => {
                                                            if(elected.nickname == member.nominated_user_name) {
                                                                 match = true;
                                                            }
                                                       });
                                                       if(!match) {
                                                            let temp = {
                                                                 'nickname': member.nominated_user_name,
                                                                 'count': 0,
                                                                 'class' : member.class
                                                            };
                                                            item.electedCouncilMember.push(temp);
                                                       }
                                                       
                                                  }
                                             });
                                             decided.nominated.new.map(member => {
                                                  if(!member.nomination.withdraw) {
                                                       let match = false;
                                                       item.electedCouncilMember.map(elected => {
                                                            if(elected.nickname == member.nickname) {
                                                                 match = true;
                                                            }
                                                       });
                                                       if(!match) {
                                                            let temp = {
                                                                 'nickname': member.nickname,
                                                                 'count': 0,
                                                                 'class' : member.class
                                                            };
                                                            item.electedCouncilMember.push(temp);
                                                       }
                                                  }
                                             });
                                             break;
                                        }
                                   }
                              }
                              item.isTimerFinished = true;
                              item.isVotingStarted = true;
                              (async () => {
                                   await this.set(resolutions, resolutionData);
                              })();
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     publishResolutionResult = async (resolutionData, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === resolutionData.resolution_id) {
                              item.isResultPublished = true;
                              this.set(resolutions, resolutionData);
                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     getOngoingResolution = async (resolutionData, callback) => {
          let details;
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id == resolutionData.resolution_id) {
                              details = resolutions.active;
                              break;
                         }
                    }
                    callback(details);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

     addressUser = async (data, callback) => {
          try {
               await this.get(data, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {
                         let item = resolutions.active[i];
                         if (item.resolution_id === data.resolution_id) {
                              for (let a = 0; a < item.usersHavingObjection.length; a++) {
                                   if (parseInt(item.usersHavingObjection[a].user.userId) == parseInt(data.user.userId)) {
                                        item.usersHavingObjection[a].addressed = true
                                        break;
                                   }
                              }
                              this.set(resolutions, data);
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }



     isEmpty = async (obj) => {
          for (var key in obj) {
               if (obj.hasOwnProperty(key))
                    return false;
          }
          return true;
     }

     setLastResolutionId = async (agmId, lastId) => {
          try {
               return new Promise(function (resolve, reject) {
                    redisClient.get('customResolutionIds', function (error, response) {
                         let customResolutionIds = JSON.parse(response);
                         if (error == null) {
                              if (customResolutionIds != null) {
                                   for (let i = 0; i < customResolutionIds.length; i++) {
                                        if (customResolutionIds[i].agmId == agmId) {
                                             customResolutionIds[i].lastId = lastId;
                                             break;
                                        }
                                   }
                              } else {
                                   customResolutionIds = [
                                        {
                                             'agmId': agmId,
                                             'lastId': lastId
                                        }
                                   ];
                              }
                              redisClient.set('customResolutionIds', JSON.stringify(customResolutionIds));
                              resolve(true);
                         } else {
                              reject(error);
                         }

                    });
               });
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     getNextResolutionId = async (agmId, callback) => {
          try {
               return new Promise(function (resolve, reject) {
                    redisClient.get('customResolutionIds', function (error, response) {
                         if (error == null) {
                              let customResolutionIds = JSON.parse(response);

                              let nextId = null;
                              if (customResolutionIds != null) {
                                   for (let i = 0; i < customResolutionIds.length; i++) {
                                        if (customResolutionIds[i].agmId == agmId) {
                                             let id = parseInt(customResolutionIds[i].lastId.split('-')[1]);
                                             nextId = 'R-' + ++id;
                                             break;
                                        }
                                   }
                                   resolve(nextId);

                              } else {
                                   resolve(nextId);
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



     createResolution = async (data, callback) => {
          try {
               let id = 'R-101';
               await this.getNextResolutionId(data.agmId).then((nextId) => {
                    if (nextId != null) {
                         id = nextId;
                    }
               });
               let options = [];
               let temp = {};
               if (data.choiceType == 'Value Options') {
                    temp = {
                         'option': data.choiceFirst,
                         'value': data.choiceFirst,
                         'percentage': 0,
                         'voted': {
                              'units': 0,
                              'shares': 0
                         }
                    };
                    options.push(temp);
                    temp = {
                         'option': data.choiceSecond,
                         'value': data.choiceSecond,
                         'percentage': 0,
                         'voted': {
                              'units': 0,
                              'shares': 0
                         }
                    };
                    options.push(temp);
               }
               let item = {
                    resolution_id: id,
                    agmId: data.agmId,
                    resolution_no: data.number,
                    resolution_heading: data.heading,
                    resolution_text: data.description,
                    resolution_proposer: '',
                    resolution_seconder: '',
                    proxy_vote_allowed: data.proxyAllowed,
                    resolution_type: data.types,
                    resolution_category: data.category,
                    decision_calculation_type: data.decisionType,
                    decision_threshold_percentage: data.decisionThreshold,
                    resolution_type_id: -1,
                    decision_at_agm: 0,
                    decision: '',
                    total_votes_received: 0,
                    total_votes_for: 0,
                    total_votes_against: 0,
                    total_votes_abstain: 0,
                    isActive: false,
                    isPending: true,
                    isDecided: false,
                    isVotingStarted: false,
                    isVotingFinished: false,
                    isTimerStarted: false,
                    isTimerFinished: false,
                    isResultPublished: false,
                    goForVote: false,
                    goForPole: false,
                    createdAtAgm: true,
                    choiceType: data.choiceType,
                    options: options,
                    votedUsers: [],
                    usersHavingObjection: []
               };

               await this.get(data, (resolutions) => {
                    resolutions.pending.push(item);
                    this.set(resolutions, data);
                    callback(resolutions);
               });

               await this.setLastResolutionId(data.agmId, id);
          } catch (error) {
               this.logs.write('error', error);
          }
     }

     updateTimerDetails = async (resolutionData, clients, agm, callback) => {
          try {
               await this.get(resolutionData, (resolutions) => {
                    for (let i = 0; i < resolutions.active.length; i++) {

                         let item = resolutions.active[i];

                         if (item.resolution_id === resolutionData.resolution_id) {
                              let totalVotesFor = 0;
                              let totalVotesAgainst = 0;
                              let totalVotesAbstain = 0;

                              let totalShareValueFor = 0;
                              let totalShareValueAgainst = 0;
                              let totalShareValueAbstain = 0;
                              if (item.resolution_type != 'Ordinary Resolution' || item.goForVote || item.goForPole) {
                                   if ((item.createdAtAgm && item.choiceType == 'For/Against/Abstain') || !item.createdAtAgm) {
                                        for (let a = 0; a < clients.length; a++) {
                                             let client = clients[a];
                                             if (client.role != 'moderator') {
                                                  let found = false;
                                                  if (item.votedUsers.length > 0) {

                                                       for (let b = 0; b < item.votedUsers.length; b++) {
                                                            let voted = item.votedUsers[b];
                                                            if (client.userId == voted.user.userId) {
                                                                 found = true;
                                                                 let userAnswer = voted.answer;
                                                                 if (client.userShares.length > 0) {
                                                                      for (let k = 0; k < client.userShares.length; k++) {
                                                                           let share = client.userShares[k];
                                                                           if (share.dues_pending_status == 'No') {
                                                                                if (voted.answer == '1') {
                                                                                     totalVotesFor++;
                                                                                     totalShareValueFor += share.share_value;
                                                                                } else if (voted.answer == '-1') {
                                                                                     totalVotesAgainst++;
                                                                                     totalShareValueAgainst += share.share_value;
                                                                                } else if (voted.answer == '0') {
                                                                                     totalVotesAbstain++;
                                                                                     totalShareValueAbstain += share.share_value;
                                                                                }
                                                                           }
                                                                      }
                                                                 }
                                                                 if (client.proxyShares.length > 0) {
                                                                      for (let c = 0; c < client.proxyShares.length; c++) {
                                                                           let proxy = client.proxyShares[c];
                                                                           if (proxy.dues_pending_status == 'No') {
                                                                                let match = false;
                                                                                if (proxy.resolutions.length > 0) {
                                                                                     for (let d = 0; d < proxy.resolutions.length; d++) {
                                                                                          let proxyAnswer = proxy.resolutions[d];
                                                                                          if (item.resolution_id == proxyAnswer.resolutionId) {
                                                                                               if (proxyAnswer.decision == '1') {
                                                                                                    totalVotesFor++;
                                                                                                    totalShareValueFor += proxy.share_value;
                                                                                                    match = true;
                                                                                               } else if (proxyAnswer.decision == '-1') {
                                                                                                    totalVotesAgainst++;
                                                                                                    totalShareValueAgainst += proxy.share_value;
                                                                                                    match = true;
                                                                                               } else if (proxyAnswer.decision == '0') {
                                                                                                    totalVotesAbstain++;
                                                                                                    totalShareValueAbstain += proxy.share_value;
                                                                                                    match = true;
                                                                                               }
                                                                                               break;
                                                                                          }
                                                                                     }
                                                                                }
                                                                                if (!match) {
                                                                                     if (userAnswer == '1') {
                                                                                          totalVotesFor++;
                                                                                          totalShareValueFor += proxy.share_value;
                                                                                     } else if (userAnswer == '-1') {
                                                                                          totalVotesAgainst++;
                                                                                          totalShareValueAgainst += proxy.share_value;
                                                                                     } else if (userAnswer == '0') {
                                                                                          totalVotesAbstain++;
                                                                                          totalShareValueAbstain += proxy.share_value;
                                                                                     }
                                                                                }
                                                                           }
                                                                      }
                                                                 }
                                                                 break;
                                                            }
                                                       }


                                                  }
                                                  if (!found) {
                                                       if (client.userShares.length > 0) {
                                                            for (let k = 0; k < client.userShares.length; k++) {
                                                                 let share = client.userShares[k];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }
                                                            }
                                                       }
                                                       if (client.proxyShares.length > 0) {
                                                            for (let c = 0; c < client.proxyShares.length; c++) {
                                                                 let proxy = client.proxyShares[c];
                                                                 if (proxy.dues_pending_status == 'No') {
                                                                      let match = false;
                                                                      if (proxy.resolutions.length > 0) {
                                                                           for (let d = 0; d < proxy.resolutions.length; d++) {
                                                                                let proxyAnswer = proxy.resolutions[d];
                                                                                if (item.resolution_id == proxyAnswer.resolutionId) {
                                                                                     if (proxyAnswer.decision == '1') {
                                                                                          match = true;
                                                                                          totalVotesFor++;
                                                                                          totalShareValueFor += proxy.share_value;
                                                                                     } else if (proxyAnswer.decision == '-1') {
                                                                                          match = true;
                                                                                          totalVotesAgainst++;
                                                                                          totalShareValueAgainst += proxy.share_value;
                                                                                     } else if (proxyAnswer.decision == '0' || proxyAnswer.decision == '') {
                                                                                          match = true;
                                                                                          totalVotesAbstain++;
                                                                                          totalShareValueAbstain += proxy.share_value;
                                                                                     }
                                                                                     break;
                                                                                }
                                                                           }
                                                                      }
                                                                      if (!match) {
                                                                           totalVotesAbstain++;
                                                                           totalShareValueAbstain += proxy.share_value;
                                                                      }
                                                                 }

                                                            }
                                                       }
                                                  }
                                             }
                                        }
                                   } else if (item.createdAtAgm && item.choiceType == 'Value Options') {
                                        for (let a = 0; a < clients.length; a++) {
                                             let client = clients[a];
                                             if (client.role != 'moderator') {
                                                  let found = false;
                                                  if (item.votedUsers.length > 0) {
                                                       for (let b = 0; b < item.votedUsers.length; b++) {
                                                            let voted = item.votedUsers[b];
                                                            if (client.userId == voted.user.userId) {
                                                                 found = true;
                                                                 for (let c = 0; c < item.options.length; c++) {
                                                                      let option = item.options[c];
                                                                      if (option.value == voted.answer) {

                                                                           if (client.userShares.length > 0) {
                                                                                for (let d = 0; d < client.userShares.length; d++) {
                                                                                     let share = client.userShares[d];
                                                                                     if (share.dues_pending_status == 'No') {
                                                                                          option.voted.units++;
                                                                                          option.voted.shares += share.share_value;
                                                                                     }
                                                                                }
                                                                           }

                                                                           if (parseInt(item.proxyAllowed) == 1) {
                                                                                if (client.proxyShares.length > 0) {
                                                                                     for (let e = 0; e < client.proxyShares.length; e++) {
                                                                                          let share = client.proxyShares[e];
                                                                                          if (share.dues_pending_status == 'No') {
                                                                                               option.voted.units++;
                                                                                               option.voted.shares += share.share_value;
                                                                                          }
                                                                                     }
                                                                                }
                                                                           }
                                                                           break;
                                                                      }
                                                                 }
                                                                 break;
                                                            }
                                                       }
                                                  }
                                                  if (!found) {

                                                       if (client.userShares.length > 0) {
                                                            for (let d = 0; d < client.userShares.length; d++) {
                                                                 let share = client.userShares[d];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }

                                                            }
                                                       }

                                                       if (parseInt(item.proxyAllowed) == 1) {
                                                            if (client.proxyShares.length > 0) {
                                                                 for (let e = 0; e < client.proxyShares.length; e++) {
                                                                      let share = client.proxyShares[e];
                                                                      if (share.dues_pending_status == 'No') {
                                                                           totalShareValueAbstain += share.share_value;
                                                                      }
                                                                 }
                                                            }
                                                       }

                                                  }
                                             }
                                        }
                                   }

                                   let decision = '';
                                   let percentage = 0;
                                   let decisionBasedOn = '';

                                   if (item.createdAtAgm) {
                                        if (item.choiceType == 'For/Against/Abstain') {
                                             let threshold = parseInt(item.decision_threshold_percentage);
                                             percentage = 0;
                                             if (item.decision_calculation_type == 'No Of Lots') {
                                                  percentage = (totalVotesFor / (totalVotesFor + totalVotesAgainst)) * 100;
                                                  decisionBasedOn = 'Units';
                                             } else if (item.decision_calculation_type == 'Number Of Share') {
                                                  percentage = (totalShareValueFor / (totalShareValueFor + totalShareValueAgainst)) * 100;
                                                  decisionBasedOn = 'Shares';
                                             }
                                             if (threshold == 50) {
                                                  if (percentage.toFixed(2) > threshold) {
                                                       decision = 'Passed';
                                                  } else {
                                                       decision = 'Failed';
                                                  }
                                             } else {
                                                  if (percentage.toFixed(2) >= threshold) {
                                                       decision = 'Passed';
                                                  } else {
                                                       decision = 'Failed';
                                                  }
                                             }


                                        } else if (item.choiceType == 'Value Options') {
                                             let threshold = parseInt(item.decision_threshold_percentage);
                                             if (item.decision_calculation_type == 'No Of Lots') {
                                                  decisionBasedOn = 'Units';
                                                  let totalUnitVoted = 0;
                                                  for (let a = 0; a < item.options.length; a++) {
                                                       let option = item.options[a];
                                                       totalUnitVoted += option.voted.units;
                                                  }
                                                  for (let a = 0; a < item.options.length; a++) {
                                                       let option = item.options[a];
                                                       option.percentage = (option.voted.units / totalUnitVoted) * 100;
                                                  }
                                             } else if (item.decision_calculation_type == 'Number Of Share') {
                                                  decisionBasedOn = 'Shares';
                                                  let totalSharesVoted = 0;
                                                  for (let a = 0; a < item.options.length; a++) {
                                                       let option = item.options[a];
                                                       totalSharesVoted += option.voted.shares;
                                                  }
                                                  for (let a = 0; a < item.options.length; a++) {
                                                       let option = item.options[a];
                                                       option.percentage = (option.voted.shares / totalSharesVoted) * 100;
                                                  }
                                             }
                                             item.options.sort((a, b) => (a.percentage > b.percentage) ? -1 : 1);
                                             let max = 0;
                                             for (let a = 0; a < item.options.length; a++) {
                                                  let option = item.options[a];
                                                  if (option.percentage > max) {
                                                       max = option.percentage;
                                                       if (threshold == 50) {
                                                            if (option.percentage.toFixed(2) > threshold) {
                                                                 decision = 'Passed';
                                                            } else {
                                                                 decision = 'Failed';
                                                            }
                                                       } else {
                                                            if (option.percentage.toFixed(2) >= threshold) {
                                                                 decision = 'Passed';
                                                            } else {
                                                                 decision = 'Failed';
                                                            }
                                                       }
                                                  }
                                             }
                                        }

                                   } else if (item.goForVote) {
                                        percentage = (totalVotesFor / (totalVotesFor + totalVotesAgainst)) * 100;
                                        decisionBasedOn = 'Units';
                                        if (percentage.toFixed(2) > 50) {
                                             decision = 'Passed';
                                        } else {
                                             decision = 'Failed';
                                        }
                                   } else if (item.goForPole) {
                                        percentage = (totalShareValueFor / (totalShareValueFor + totalShareValueAgainst)) * 100;
                                        decisionBasedOn = 'Shares';
                                        if (percentage.toFixed(2) > 50) {
                                             decision = 'Passed';
                                        } else {
                                             decision = 'Failed';
                                        }
                                   } else {
                                        percentage = (totalShareValueFor / (totalShareValueFor + totalShareValueAgainst)) * 100;
                                        decisionBasedOn = 'Shares';
                                        if (item.resolution_type == '90% Resolution') {
                                             if (percentage.toFixed(2) >= 90) {
                                                  decision = 'Passed';
                                             } else {
                                                  decision = 'Failed';
                                             }
                                        } else if (item.resolution_type == 'Special Resolution') {
                                             if (percentage.toFixed(2) >= 75) {
                                                  decision = 'Passed';
                                             } else {
                                                  decision = 'Failed';
                                             }
                                        }

                                   }

                                   item.total_votes_for = totalVotesFor;
                                   item.total_votes_against = totalVotesAgainst;
                                   item.total_votes_abstain = totalVotesAbstain;
                                   item.total_votes_received = totalVotesFor + totalVotesAgainst;
                                   item.total_share_for = totalShareValueFor;
                                   item.total_share_against = totalShareValueAgainst;
                                   item.total_share_abstain = totalShareValueAbstain;
                                   item.percentage = percentage > 0 ? percentage.toFixed(2) : 0;
                                   item.decisionBasedOn = decisionBasedOn;
                                   item.decision = decision;

                              } else {
                                   if (item.resolution_type_id == 3) {
                                        let nriuc = {}; // Nomination received in Unique Class
                                        for (let a = 0; a < clients.length; a++) {
                                             let client = clients[a];
                                             if (client.role != 'moderator') {
                                                  let clientNominationClass = client.nomination.class.trim();
                                                  if (client.nomination.isNominated && client.nomination.accepted) {
                                                       item.nominated.new.push(client);
                                                       if(!client.nomination.withdraw) {
                                                            if(typeof nriuc[clientNominationClass] == 'undefined') {
                                                                 let temp = {
                                                                      'nickname' : client.nickname,
                                                                      'class' : clientNominationClass,
                                                                      'count' : 0
                                                                 }
                                                                 nriuc[clientNominationClass] = [];
                                                                 nriuc[clientNominationClass].push(temp);
                                                            } else {
                                                                 let temp = {
                                                                      'nickname' : client.nickname,
                                                                      'class' : clientNominationClass,
                                                                      'count' : 0
                                                                 }
                                                                 nriuc[clientNominationClass].push(temp);
                                                            }
                                                       }
                                                  }
                                                  if (!client.nomination.isNominated && client.nomination.withdraw) {
                                                       for (let b = 0; b < item.nominated.pre.length; b++) {
                                                            let member = item.nominated.pre[b];
                                                            let nameArray = client.nickname.split('-');
                                                            let nickname = nameArray[0] + '-' + nameArray[1] + '-' + nameArray[2] + '-' + nameArray[3];
                                                            if (member.nominated_user_name == nickname) {
                                                                 member.withdraw = true;
                                                            }
                                                       }
                                                  }
                                             }
                                        }
                                        for (let b = 0; b < item.nominated.pre.length; b++) {
                                             let member = item.nominated.pre[b];
                                             if(typeof member.withdraw == 'undefined') {
                                                  if(typeof nriuc[member.class.trim()] == 'undefined') {
                                                       let temp = {
                                                            'nickname' : member.nominated_user_name,
                                                            'class' : member.class.trim(),
                                                            'count' : 0
                                                       }
                                                       nriuc[member.class.trim()] = [];
                                                       nriuc[member.class.trim()].push(temp);
                                                  } else {
                                                       let temp = {
                                                            'nickname' : member.nominated_user_name,
                                                            'class' : member.class.trim(),
                                                            'count' : 0
                                                       }
                                                       nriuc[member.class.trim()].push(temp);
                                                  }
                                             }
                                        }
                                        
                                        for (let b = 0; b < resolutions.pending.length; b++) {
                                             if (resolutions.pending[b].resolution_type_id == 4) {
                                                  let maxCouncilMember = 0;
                                                  item.nominated.pre.map(member => {
                                                       if (typeof member.withdraw == 'undefined') {
                                                            maxCouncilMember++;
                                                       }
                                                  });
                                                  item.nominated.new.map(member => {
                                                       if (!member.nomination.withdraw) {
                                                            maxCouncilMember++;
                                                       }
                                                  });
                                                  resolutions.pending[b].minCouncilMember = Object.keys(nriuc).length > 3 ? Object.keys(nriuc).length : resolutions.pending[b].minCouncilMember;
                                                  resolutions.pending[b].maxCouncilMember = maxCouncilMember;
                                             }
                                             if(resolutions.pending[b].resolution_type_id == 5) {
                                                  for (let c = 0; c < agm.usageClass.length; c++) {
                                                       let agmUsageClass = agm.usageClass[c];
                                                       if(typeof nriuc[agmUsageClass] != 'undefined' && nriuc[agmUsageClass].length == 1) {
                                                            resolutions.pending[b].electedCouncilMember.push(nriuc[agmUsageClass][0]);
                                                       }
                                                  }
                                             }
                                        }
                                        
                                   } else if (item.resolution_type_id == 4) {
                                        let votes = [];
                                        for (let a = 0; a < item.votedUsers.length; a++) {
                                             let user = item.votedUsers[a];
                                             let found = false;
                                             for (let b = 0; b < votes.length; b++) {
                                                  if (votes[b].range == user.answer) {
                                                       let count = 0;
                                                       user.user.userShares.forEach((share) => {
                                                            if (share.dues_pending_status == 'No') {
                                                                 count++;
                                                            }
                                                       });
                                                       user.user.proxyShares.forEach((share) => {
                                                            if (share.dues_pending_status == 'No') {
                                                                 count++;
                                                            }
                                                       });
                                                       votes[b].count = votes[b].count + count;
                                                       found = true;
                                                  }
                                             }
                                             if (!found) {
                                                  let count = 0;
                                                  user.user.userShares.forEach((share) => {
                                                       if (share.dues_pending_status == 'No') {
                                                            count++;
                                                       }
                                                  });
                                                  user.user.proxyShares.forEach((share) => {
                                                       if (share.dues_pending_status == 'No') {
                                                            count++;
                                                       }
                                                  });
                                                  let range = {
                                                       'range': user.answer,
                                                       'count': count,
                                                       'percentage': 0
                                                  };
                                                  votes.push(range);
                                             }
                                        }

                                        let votedClientsCount = 0;
                                        for (let d = 0; d < clients.length; d++) {
                                             let client = clients[d];
                                             if (client.role != 'moderator') {
                                                  let match = false;
                                                  for (let e = 0; e < item.votedUsers.length; e++) {
                                                       let temp = item.votedUsers[e];
                                                       if (client.userId == temp.user.userId) {
                                                            client.userShares.forEach((share) => {
                                                                 if (share.dues_pending_status == 'No') {
                                                                      votedClientsCount++;
                                                                 }
                                                            });
                                                            client.proxyShares.forEach((share) => {
                                                                 if (share.dues_pending_status == 'No') {
                                                                      votedClientsCount++;
                                                                 }
                                                            });
                                                            match = true;
                                                            break;
                                                       }
                                                  }
                                                  if (!match) {

                                                       if (client.userShares.length > 0) {
                                                            for (let c = 0; c < client.userShares.length; c++) {
                                                                 let share = client.userShares[c];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }
                                                            }
                                                       }

                                                       if (client.proxyShares.length > 0) {
                                                            for (let c = 0; c < client.proxyShares.length; c++) {
                                                                 let share = client.proxyShares[c];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }

                                                            }
                                                       }
                                                  }
                                             }
                                        }
                                        item.total_votes_abstain = totalVotesAbstain;
                                        item.total_share_abstain = totalShareValueAbstain;
                                        let max = 0;
                                        for (let c = 0; c < votes.length; c++) {
                                             if (votes[c].count > max) {
                                                  max = votes[c].count
                                                  votes[c].percentage = ((votes[c].count / votedClientsCount) * 100).toFixed(2);
                                                  item.approvedCouncilMember = votes[c].range;
                                                  item.decision = votes[c].range;
                                             } else {
                                                  votes[c].percentage = ((votes[c].count / votedClientsCount) * 100).toFixed(2);
                                             }

                                        }
                                        votes.sort((a, b) => (a.count > b.count) ? -1 : 1);
                                        item.responseOnNumberOfCouncilMember = votes.slice(0, 1);


                                   } else if (item.resolution_type_id == 5) {
                                        let temp = [];

                                        for (let a = 0; a < item.votedUsers.length; a++) {
                                             let voted = item.votedUsers[a];
                                             for (let b = 0; b < voted.answer.length; b++) {
                                                  let answer = voted.answer[b];
                                                  let found = false;
                                                  for (let c = 0; c < temp.length; c++) {
                                                       if (answer.nickname == temp[c].nickname) {
                                                            found = true;
                                                            if (answer.selected) {
                                                                 let count = 0;
                                                                 voted.user.userShares.forEach((share) => {
                                                                      if (share.dues_pending_status == 'No') {
                                                                           count++;
                                                                      }
                                                                 });
                                                                 voted.user.proxyShares.forEach((share) => {
                                                                      if (share.dues_pending_status == 'No') {
                                                                           count++;
                                                                      }
                                                                 });
                                                                 temp[c].count = temp[c].count + count;
                                                            }
                                                       }
                                                  }
                                                  if (!found) {
                                                       let count = 0;
                                                       voted.user.userShares.forEach((share) => {
                                                            if (share.dues_pending_status == 'No') {
                                                                 count++;
                                                            }
                                                       });
                                                       voted.user.proxyShares.forEach((share) => {
                                                            if (share.dues_pending_status == 'No') {
                                                                 count++;
                                                            }
                                                       });
                                                       let vote = {};
                                                       if (answer.selected) {
                                                            vote = {
                                                                 'nickname': answer.nickname,
                                                                 'count': count
                                                            };
                                                       } else {
                                                            vote = {
                                                                 'nickname': answer.nickname,
                                                                 'count': 0
                                                            };
                                                       }
                                                       temp.push(vote);
                                                  }
                                             }
                                        }
                                        for (let d = 0; d < clients.length; d++) {
                                             let client = clients[d];
                                             if (client.role != 'moderator') {
                                                  let match = false;
                                                  for (let e = 0; e < item.votedUsers.length; e++) {
                                                       let temp = item.votedUsers[e];
                                                       if (client.userId == temp.user.userId) {
                                                            match = true;
                                                            break;
                                                       }
                                                  }
                                                  if (!match) {

                                                       if (client.userShares.length > 0) {
                                                            for (let c = 0; c < client.userShares.length; c++) {
                                                                 let share = client.userShares[c];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }

                                                            }
                                                       }

                                                       if (client.proxyShares.length > 0) {
                                                            for (let c = 0; c < client.proxyShares.length; c++) {
                                                                 let share = client.proxyShares[c];
                                                                 if (share.dues_pending_status == 'No') {
                                                                      totalVotesAbstain++;
                                                                      totalShareValueAbstain += share.share_value;
                                                                 }
                                                            }
                                                       }
                                                  }
                                             }
                                        }

                                        item.total_votes_abstain = totalVotesAbstain;
                                        item.total_share_abstain = totalShareValueAbstain;
                                        let preNominatedMembers = [];
                                        let newNominatedMembers = [];
                                        for (let b = 0; b < resolutions.decided.length; b++) {
                                             if (resolutions.decided[b].resolution_type_id == 3) {
                                                  preNominatedMembers = resolutions.decided[b].nominated.pre;
                                                  newNominatedMembers = resolutions.decided[b].nominated.new;
                                                  break;
                                             }
                                        }

                                        let councilMember = {};
                                        for (let a = 0; a < agm.usageClass.length; a++) {
                                             let agmUsageClass = agm.usageClass[a];
                                             preNominatedMembers.map(member => {
                                                  if (typeof member.withdraw == 'undefined') {
                                                       if (agmUsageClass == member.class.trim()) {
                                                            temp.map(tempMember => {
                                                                 if (member.nominated_user_name == tempMember.nickname) {
                                                                      let memberDetails = {
                                                                           'nickname': tempMember.nickname,
                                                                           'class': member.class.trim(),
                                                                           'count': tempMember.count
                                                                      }
                                                                      if (typeof councilMember[agmUsageClass] == 'undefined') {
                                                                           councilMember[agmUsageClass] = [];
                                                                           councilMember[agmUsageClass].push(memberDetails);
                                                                      } else {
                                                                           councilMember[agmUsageClass].push(memberDetails);
                                                                      }
                                                                 }
                                                            });
                                                       }
                                                  }

                                             });

                                             newNominatedMembers.map(member => {
                                                  if (!member.nomination.withdraw) {
                                                       if (agmUsageClass == member.nomination.class.trim()) {
                                                            temp.map(tempMember => {
                                                                 if (member.nickname == tempMember.nickname) {
                                                                      let memberDetails = {
                                                                           'nickname': tempMember.nickname,
                                                                           'class': member.nomination.class,
                                                                           'count': tempMember.count
                                                                      }
                                                                      if (typeof councilMember[agmUsageClass] == 'undefined') {
                                                                           councilMember[agmUsageClass] = [];
                                                                           councilMember[agmUsageClass].push(memberDetails);
                                                                      } else {
                                                                           councilMember[agmUsageClass].push(memberDetails);
                                                                      }
                                                                 }
                                                            });
                                                       }
                                                  }
                                             });

                                        }

                                        /**
                                         * Here we are sorting council member count
                                         */
                                        for (let a = 0; a < agm.usageClass.length; a++) {
                                             let agmUsageClass = agm.usageClass[a];
                                             if (typeof councilMember[agmUsageClass] != 'undefined') {
                                                  let councilMemberCount = councilMember[agmUsageClass].length;
                                                  if (councilMemberCount > 1) {
                                                       councilMember[agmUsageClass].sort((b, c) => (b.count > c.count) ? -1 : 1);
                                                  }
                                             } else {
                                                  councilMember[agmUsageClass] = [];
                                             }
                                        }
                                        
                                        let tempCouncilMember = [];
                                        for (let a = 0; a < agm.usageClass.length; a++) {
                                             let agmUsageClass = agm.usageClass[a];
                                             let councilMemberCount = councilMember[agmUsageClass].length;
                                             if (councilMemberCount == 1) {
                                                  councilMember[agmUsageClass].map(member => {
                                                       item.electedCouncilMember.push(member);
                                                  });
                                             } else if (councilMemberCount > 1) {
                                                  councilMember[agmUsageClass].slice(0, 1).map(member => {
                                                       item.electedCouncilMember.push(member);
                                                  });
                                                  councilMember[agmUsageClass].slice(1).map(member => {
                                                       tempCouncilMember.push(member);
                                                  });
                                             }
                                        }


                                        tempCouncilMember.sort((a, b) => (a.count > b.count) ? -1 : 1);
                                        let approvedCouncilMember = 0
                                        for (let b = 0; b < resolutions.decided.length; b++) {
                                             if (resolutions.decided[b].resolution_type_id == 4) {
                                                  approvedCouncilMember = resolutions.decided[b].approvedCouncilMember;
                                                  break;
                                             }
                                        }
                                        
                                        tempCouncilMember.slice(0, approvedCouncilMember - item.electedCouncilMember.length).map(member => {
                                             item.electedCouncilMember.push(member);
                                        });
                                        
                                        item.electedCouncilMember.sort((a, b) => (a.count > b.count) ? -1 : 1);
                                        
                                   }
                              }
                              item.isTimerFinished = true;
                              (async () => {
                                   await this.set(resolutions, resolutionData);
                              })();

                              break;
                         }
                    }
                    callback(resolutions);
               });
          } catch (error) {
               this.logs.write('error', error);
          }

     }

}
