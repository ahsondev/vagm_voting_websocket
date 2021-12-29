const QueryBuilder = require('node-querybuilder');

export class Database {

     db;

     constructor(database) {
          // this.db = new QueryBuilder(database, 'mysql', 'pool');
          this.db = new QueryBuilder(database, 'mysql');
     }

     connection = async () => {
          // return await this.db.get_connection();

          return this.db;
     }
}