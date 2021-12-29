const cors = require('cors');
const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const dotenv = require('dotenv');
import { Client } from './client';
import { Resolution } from './resolution';
import { Agm } from './agm';
import { Redis } from '../helpers/redis';
import { Logs } from '../helpers/logs';

dotenv.config();

let options = {
     app: process.env.NODE_APP,
     environment: process.env.NODE_ENV
};
let config = require('../config/config')(options);
app.use(cors());

app.get('/', (req, res) => {
     res.send('<h1>Unauthorised</h1>');
});

let connectCounter = config.connectCounter;



io.on('connection', async (socket) => {

     let logs = new Logs();
     let webinar = socket.handshake.query.webinar;

     logs.write('info', 'Connection Counter Value : ', connectCounter);
     
     logs.write('info', 'New Connection Requet', JSON.parse(webinar));
     let connectionId = socket.id;
     let client = new Client(options);
     connectCounter++;
     
     await client.authorize(webinar, connectionId, (response) => {

          if (response.authorized) {

               logs.write('info', 'User Authorized');
               socket.join(client.agm);
               logs.write('info', 'On Connect New User Connection Count : ', connectCounter);

               socket.on('disconnect', function() { 
                    connectCounter--; 
                    logs.write('info', 'After Disconnect User Connection Count : ', connectCounter);
               });

               // io.emit('authorized', { data: response });

               io.to(connectionId).emit('authorized', { data: response });

               client.get(client.agm).then((clients) => {
                    try {
                         let totalLoggedInShares = 0
                         let totalLoggedInUnits = 0;

                         if (typeof clients != 'undefined') {
                              for (let i = 0; i < clients.length; i++) {

                                   if (clients[i].role != 'moderator') {
                                        if (clients[i].userShares.length > 0) {
                                             for (let k = 0; k < clients[i].userShares.length; k++) {
                                                  totalLoggedInUnits++;
                                                  totalLoggedInShares += clients[i].userShares[k].share_value;
                                             }
                                        }
                                        if (clients[i].proxyShares.length > 0) {
                                             for (let k = 0; k < clients[i].proxyShares.length; k++) {
                                                  totalLoggedInUnits++;
                                                  totalLoggedInShares += clients[i].proxyShares[k].share_value;
                                             }
                                        }
                                   }
                              }
                         }
                         let details = {
                              'totalLoggedInUnits': totalLoggedInUnits,
                              'totalLoggedInShares': totalLoggedInShares
                         }

                         socket.to(client.agm).emit('newUserLoggedIn', {
                              data: details,
                              message: 'Success',
                              code: 200,
                              status: true
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }


               });


               socket.on('primaryInformation', (data) => {
                    try {
                         client.get(client.agm).then((clients) => {
                              let details = {
                                   'isVotingManagerFound': 0,
                                   'isCurrentUserVotingManager': 0,
                                   'isMeetingStarted': 0,
                              };
                              if (typeof clients != 'undefined') {
                                   for (let i = 0; i < clients.length; i++) {
                                        let item = clients[i];
                                        if (item.role == 'moderator' && item.moderator.isVotingManager) {
                                             details.isVotingManagerFound = 1;
                                             break;
                                        }
                                   }
                                   for (let i = 0; i < clients.length; i++) {
                                        let item = clients[i];
                                        if (item.userId == data.userId) {
                                             if (item.role == 'moderator' && item.moderator.isVotingManager) {
                                                  details.isCurrentUserVotingManager = 1;
                                                  break;
                                             }
                                        }
                                   }
                              }
                              let agm = new Agm(options);
                              agm.get(client.agm).then((response) => {
                                   if (response.isMeetingStarted) {
                                        details.isMeetingStarted = 1;
                                   }
                                   io.to(connectionId).emit('primaryInformationResponse', {
                                        data: details,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('activeClients', (data) => {
                    try {
                         client.get(client.agm).then((clients) => {
                              io.to(connectionId).emit('activeClientResponse', {
                                   data: clients,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              })
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('activeClientsDetails', (data) => {
                    try {
                         client.get(client.agm).then((clients) => {
                              let totalLoggedInShares = 0
                              let totalLoggedInUnits = 0;

                              if (typeof clients != 'undefined') {
                                   for (let i = 0; i < clients.length; i++) {

                                        if (clients[i].role != 'moderator') {
                                             if (clients[i].userShares.length > 0) {
                                                  for (let k = 0; k < clients[i].userShares.length; k++) {
                                                       totalLoggedInUnits++;
                                                       totalLoggedInShares += clients[i].userShares[k].share_value;
                                                  }
                                             }
                                             if (clients[i].proxyShares.length > 0) {
                                                  for (let k = 0; k < clients[i].proxyShares.length; k++) {
                                                       totalLoggedInUnits++;
                                                       totalLoggedInShares += clients[i].proxyShares[k].share_value;
                                                  }
                                             }
                                        }
                                   }
                              }

                              let details = {
                                   'totalLoggedInUnits': totalLoggedInUnits,
                                   'totalLoggedInShares': totalLoggedInShares
                              }
                              io.to(connectionId).emit('activeClientsDetailsResponse', {
                                   data: details,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });


               socket.on('userDetails', (data) => {
                    try {
                         io.to(connectionId).emit('userDetailsResponse', {
                              data: client.currentUser,
                              message: 'Success',
                              code: 200,
                              status: true
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('checkVotingManager', (data) => {
                    try {
                         client.isVotingManager((found) => {
                              io.to(connectionId).emit('checkVotingManagerResponse', {
                                   data: client.currentUser,
                                   message: 'Success',
                                   code: 200,
                                   status: found
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('votingManagerLoggedIn', (data) => {
                    try {
                         io.to(data.agmId).emit('votingManagerLoggedInResponse', {
                              data: {},
                              message: 'Success',
                              code: 200,
                              status: true
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('updateUserProfile', (userData) => {
                    try {
                         client.update(userData).then(() => {
                              io.to(connectionId).emit('updateUserProfileResponse', {
                                   data: client.currentUser,
                                   message: "Success",
                                   code: 200,
                                   status: true
                              });
                              if (typeof userData.profile.isVotingManager != 'undefined') {
                                   io.to(connectionId).emit('votingManagerFound', {
                                        data: {},
                                        message: "Success",
                                        code: 200,
                                        status: true
                                   });
                              }
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('quorumAchieved', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.get(data.agmId).then((result) => {
                              client.get(client.agm).then((clients) => {
                                   let totalUserShares = 0;
                                   for (let i = 0; i < clients.length; i++) {
                                        if (clients[i].role != 'moderator') {
                                             if (clients[i].userShares.length > 0) {
                                                  for (let k = 0; k < clients[i].userShares.length; k++) {
                                                       totalUserShares += clients[i].userShares[k].share_value;
                                                  }
                                             }
                                             if (clients[i].proxyShares.length > 0) {
                                                  for (let k = 0; k < clients[i].proxyShares.length; k++) {
                                                       totalUserShares += clients[i].proxyShares[k].share_value;
                                                  }
                                             }
                                        }
                                   }
                                   let percentage = (result.totalShares * (30 / 100));
                                   io.to(client.agm).emit('quorumAchievedResponse', {
                                        data: true,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('quorumDetails', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.get(data.agmId).then((result) => {
                              client.get(client.agm).then((clients) => {
                                   let totalUserShares = 0;
                                   if (typeof clients != 'undefined') {
                                        for (let i = 0; i < clients.length; i++) {
                                             if (clients[i].role != 'moderator') {
                                                  if (clients[i].userShares.length > 0) {
                                                       for (let k = 0; k < clients[i].userShares.length; k++) {
                                                            totalUserShares += clients[i].userShares[k].share_value;
                                                       }
                                                  }
                                                  if (clients[i].proxyShares.length > 0) {
                                                       for (let k = 0; k < clients[i].proxyShares.length; k++) {
                                                            totalUserShares += clients[i].proxyShares[k].share_value;
                                                       }
                                                  }
                                             }
                                        }
                                   }

                                   let loggedInShares = ((totalUserShares / result.totalShares) * 100);
                                   let remaningShares = 30 - loggedInShares;
                                   let thirtyPercentageShare = ((result.totalShares * 30) / 100);

                                   let shareDetails = {
                                        'loggedInShares': totalUserShares,
                                        'remaningShares': (thirtyPercentageShare - totalUserShares) > 0 ? (thirtyPercentageShare - totalUserShares).toFixed() : 0,
                                        'loggedInSharesPercentage': loggedInShares.toFixed(2),
                                        'remaningSharesPercentage': remaningShares > 0 ? remaningShares.toFixed(2) : 0.00
                                   }
                                   io.to(client.agm).emit('quorumDetailsResponse', {
                                        data: shareDetails,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('getAgmDetails', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.get(client.agm).then((result) => {
                              io.to(connectionId).emit('getAgmDetailsResponse', {
                                   data: result,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('startAgmTimer', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.get(client.agm).then((metting) => {
                              if (!metting.isTimerStarted) {

                                   var date = new Date();
                                   var meetingDate = metting.start.date + ' ' + metting.start.time;
                                   var meetingTime = new Date(meetingDate);

                                   var counter = metting.start.timer;

                                   date.setMinutes(date.getMinutes() + 30);

                                   agm.startTimer(data.agmId).then(() => {
                                        var timerId = setInterval(function () {
                                             counter -= 1000;
                                             var min = Math.floor(counter / (60 * 1000));
                                             var sec = Math.floor((counter - (min * 60 * 1000)) / 1000);
                                             if (counter > 0) {
                                                  io.to(connectionId).emit('startAgmTimerResponse', {
                                                       data: min + ':' + sec,
                                                       message: 'Success',
                                                       code: 200,
                                                       status: true
                                                  });
                                             } else {
                                                  clearInterval(timerId);
                                                  io.to(connectionId).emit('endAgmTimerResponse', {
                                                       data: min + ':' + sec,
                                                       message: 'Success',
                                                       code: 200,
                                                       status: true
                                                  });
                                             }
                                        }, 1000);
                                   });
                              }

                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('startMeeting', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.start(data.agmId).then((response) => {
                              io.to(data.agmId).emit('startMeetingResponse', {
                                   data: response,
                                   status: true,
                                   message: 'Success',
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('isMeetingStarted', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.get(data.agmId).then((response) => {
                              io.to(data.agmId).emit('isMeetingStartedResponse', {
                                   data: response,
                                   status: response.isMeetingStarted,
                                   message: 'Success',
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               })

               socket.on('startResolution', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.startResolution(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('startResolutionResponse', {
                                   status: true,
                                   data: resolutions,
                                   message: "Success",
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('backToPending', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.backToPending(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('backToPendingResponse', {
                                   status: true,
                                   data: resolutions,
                                   message: "Success",
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('startVoting', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.startResolutionVoting(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('startVotingResponse', {
                                   status: true,
                                   data: resolutions,
                                   message: "Success",
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('startVotingTimer', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         let time;
                         if (resolutionData.time > 5) {
                              time = resolutionData.time * 1000;
                         } else {
                              time = resolutionData.time * 60 * 1000;
                         }

                         var timerId = setInterval(function () {
                              time -= 1000;

                              var min = Math.floor(time / (60 * 1000));
                              var sec = Math.floor((time - (min * 60 * 1000)) / 1000);
                              min = min < 10 ? '0' + min : min;
                              sec = sec < 10 ? '0' + sec : sec;
                              if (time > 0) {
                                   io.to(resolutionData.agmId).emit('startVotingTimerResponse', {
                                        data: min + ':' + sec,
                                        message: 'Timer Start',
                                        code: 200,
                                        status: true
                                   });
                              } else {
                                   resolutionData.timerId = timerId;
                                   clearInterval(timerId);
                                   let agm = new Agm(options);
                                   agm.get(resolutionData.agmId).then((agm) => {
                                        client.get(client.agm).then((clients) => {
                                             resolution.updateTimerDetails(resolutionData, clients, agm, (resolutions) => {
                                                  io.to(resolutionData.agmId).emit('endtVotingTimerResponse', {
                                                       data: resolutions,
                                                       clients: clients,
                                                       message: 'Timer End',
                                                       code: 200,
                                                       status: true
                                                  });

                                             });
                                        });
                                   });

                              }
                         }, 1000);
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('updateResolutionTimer', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.updateResolutionTimer(resolutionData).then(() => {
                              resolution.getAgmResolution(resolutionData).then((resolutions) => {
                                   io.to(resolutionData.agmId).emit('updateResolutionTimerResponse', {
                                        data: resolutions,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              })
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('getResolutionDetails', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.isEmpty(resolutionData).then((empty) => {
                              if (!empty) {
                                   resolution.getOngoingResolution(resolutionData, (resolutions) => {
                                        io.to(connectionId).emit('getResolutionDetailsResponse', {
                                             data: resolutions,
                                             message: 'Success',
                                             code: 200,
                                             status: true
                                        });
                                   });
                              }
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('addressUser', (data) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.addressUser(data, (resolutions) => {
                              io.to(connectionId).emit('addressUserResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('electAllNominated', (data) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.electAllNominated(data, (resolutions) => {
                              io.to(data.agmId).emit('electAllNominatedResponse', {
                                   data: resolutions,
                                   message: "Success",
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('finishResolution', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.finishResolution(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('finishResolutionResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('declareApproved', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.declareApproved(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('declareApprovedResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('publishResult', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.publishResolutionResult(resolutionData, (resolutions) => {
                              client.get(client.agm).then((clients) => {
                                   io.to(resolutionData.agmId).emit('publishResultResponse', {
                                        data: resolutions,
                                        clients: clients,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('updateResolutionAnswer', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.updateResolutionAnswer(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('updateResolutionAnswerResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('goForVote', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.goForVote(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('goForVoteResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('goForPole', (resolutionData) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.goForPole(resolutionData, (resolutions) => {
                              io.to(resolutionData.agmId).emit('goForPoleResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('removeUserProfile', (userData) => {
                    try {
                         client.remove(userData).then(() => {
                              io.to(connectionId).emit('removeUserProfileResponse', {
                                   data: {},
                                   message: 'Success',
                                   status: true,
                                   code: 200
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('getResolutions', (data) => {
                    try {
                         let resolution = new Resolution(options);
                         client.get(client.agm).then((clients) => {
                              resolution.get(client.currentUser, (resolutions) => {
                                   io.to(connectionId).emit('resolutionResponse', {
                                        data: resolutions,
                                        clients: clients,
                                        message: 'Success',
                                        code: 200,
                                        status: true
                                   });
                              });

                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('nominateClient', (user) => {
                    try {
                         client.nominate(user, (clients) => {
                              io.to(client.agm).emit('nominateClientResponse', {
                                   data: clients,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('acceptNomination', (user) => {
                    try {
                         client.acceptNomination(user, (clients) => {
                              io.to(connectionId).emit('acceptNominationResponse', {
                                   data: clients,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('declineNomination', (user) => {
                    try {
                         client.declineNomination(user, (clients) => {
                              io.to(connectionId).emit('declineNominationResponse', {
                                   data: clients,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('withdrawNomination', (user) => {
                    try {
                         client.withdraw(user, (clients) => {
                              io.to(client.agm).emit('withdrawNominationResponse', {
                                   data: clients,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('createResolutions', (data) => {
                    try {
                         let resolution = new Resolution(options);
                         resolution.createResolution(data, (resolutions) => {
                              io.to(connectionId).emit('createResolutionsResponse', {
                                   data: resolutions,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }

               });

               socket.on('endMeeting', (data) => {
                    try {
                         let agm = new Agm(options);
                         agm.end(data.agmId).then((response) => {
                              io.to(data.agmId).emit('endMeetingResponse', {
                                   data: response,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

               socket.on('clearRedisData', () => {
                    try {
                         let redis = new Redis();
                         redis.delete((response) => {
                              io.to(client.agm).emit('clearRedisDataResponse', {
                                   data: response,
                                   message: 'Success',
                                   code: 200,
                                   status: true
                              });
                         });
                    } catch (error) {
                         logs.write('error', error);
                    }
               });

          } else {
               io.emit('unauthorized', { data: response });
               logs.write('info', 'User Unauthorized');
          }
     });
});

http.listen(2053, () => {
     console.log('listening on *:2053');
});
