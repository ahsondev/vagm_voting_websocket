module.exports.secondsToHms = (d) => {
     d = Number(d);
     var h = Math.floor(d / 3600);
     var m = Math.floor(d % 3600 / 60);
     var s = Math.floor(d % 3600 % 60);

     // var hDisplay = h > 0 ? h : '';
     // var mDisplay = m > 0 ? m : '00';
     // var sDisplay = s > 0 ? s : '00';
     var hDisplay = h;
     var mDisplay = m;
     var sDisplay = s;

     if (s < 10) {
          sDisplay = "0" + s;
     }

     return hDisplay + mDisplay + ":" + sDisplay;
};

module.exports.getUserSharesFromClients = (activeClients, callback) => {
     let totalUnits = 0;
     let totalShares = 0;
     if (activeClients.length > 0) {
          for (const item of activeClients) {
               totalUnits += item.userShares.length;
               totalUnits += item.proxyShares.length;

               let index = 0;
               for (const userShare of item.userShares) {
                    totalShares += parseInt(userShare.share_value);

                    if (index === item.userShares.length - 1) {
                         let proxyIndex = 0;
                         for (const proxyShare of item.proxyShares) {
                              totalShares += parseInt(proxyShare.share_value);

                              if (proxyIndex === item.proxyShares.length - 1) {
                                   callback({
                                        totalUnits: totalUnits,
                                        totalShares: totalShares
                                   })
                              }
                              proxyIndex++;
                         }
                    }
                    index++;
               }
          }
     } else {
          console.log('no elements in the length');
          console.log(activeClients);
     }
}
