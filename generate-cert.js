const selfsigned = require('selfsigned');
console.log(selfsigned);
const fs = require('fs');


(async () => {
    try {
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = await selfsigned.generate(attrs, { days: 365, algorithm: 'sha256' });

        console.log("Keys generated:", Object.keys(pems));
        fs.writeFileSync('cert.pem', pems.cert);
        fs.writeFileSync('key.pem', pems.private);
        console.log("Certificate generation complete.");
    } catch (err) {
        console.error(err);
    }
})();

console.log('✅ SSL Certificates generated successfully: cert.pem, key.pem');
