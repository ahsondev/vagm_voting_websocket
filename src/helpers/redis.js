const redis = require('redis');
const redisClient = redis.createClient({ host: 'localhost', port: 6379 });

export class Redis {

    constructor() {

    }

    delete = async(callback) => {
        let keys = ['agm','clients','resolutions','customResolutionIds'];
        for(let i = 0; i < keys.length; i++) {
            redisClient.del(keys[i], (err, response) => {
                if(i == (keys.length - 1)) {
                    callback(true);
                }
            });
        }
    }
}