const opts = {
     logFilePath: 'logs/voting.log',
     timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
};
const log = require('simple-node-logger').createSimpleFileLogger(opts);

export class Logs {

     constructor() {

     }

     write = (level, message, data = null) => {
          switch (level) {
               case 'error':
                    log.error(message);
                    break;
               case 'info':
                    log.info(message + '  ', data);
                    break;
               case 'trace':
                    log.trace(message);
                    break;
               default:
                    break;
          }
     }
}
