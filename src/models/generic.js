const QueryBuilder = require('node-querybuilder');

class GenericModel {
     config;
     connection;
     db;

     constructor(options) {
          this.config = require('../config/config')(options);
          // this.db = new QueryBuilder(this.config.database, 'mysql');
     }

     async getGenericData(tableName, where = null, select = null, sort = null, limit = null) {
          if (typeof where != null) {
               this.db.where(where);
          }

          if (typeof select != null) {
               this.db.select(select);
          }

          if (typeof sort != null) {
               this.db.order_by(sort);
          }

          if (typeof limit != null) {
               this.db.limit(limit);
          }

          this.db.from(tableName);

          let result = await this.db.get();
          this.db.disconnect();
          return result;
     }

     async updateGenericData(tableName, where, updateData, callback) {
          this.db.update(tableName, updateData, where, (err, res) => {
               if (err) throw err;
               this.db.disconnect();
               return callback(res);
          });
     }

     async addGenericData(tableName, data) {
          //const result = await this.db.insert(tableName, data);
          //this.db.disconnect();
          return true;
          return result;
     }

     async removeGenericData(tableName, where) {
          try {
               let result = await this.db.delete(tableName, where);
               await this.db.disconnect(callback => {
                         return result;
                    }
               );
          } catch (err) {
               // console.log(err);
          } finally {

          }
     }

     async runQuery(query) {
          return this.db.query(query, (err, res) => {
               if (err) throw err;
               this.db.disconnect();
               return res;
          });
     }
}

export { GenericModel };
