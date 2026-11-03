import {readerRoute} from './routes';

const canonicalOrigin='https://ebenezer-script-reader.pages.dev';
const beaconSource='https://static.cloudflareinsights.com/beacon.min.js';
// Public analytics site identifier, not an authentication credential.
const siteToken='c1a873d849c44a0fb147d5279cb72e9b';
const initialized=new WeakSet<Document>();

/** Document bootstrap only; private/admin routes never initialize the provider. */
export function bootstrapStudentAnalytics(doc:Document,href:string,development:boolean){
 if(initialized.has(doc))return;
 initialized.add(doc);
 try{
  const url=new URL(href);
  if(development||url.origin!==canonicalOrigin||readerRoute(url.pathname,url.protocol,development).kind!=='production')return;
  if(doc.referrer){const previous=new URL(doc.referrer);if(previous.origin===url.origin&&/^\/admin(?:\/|$)/.test(previous.pathname))return;}
  if(doc.querySelector(`script[src="${beaconSource}"]`))return;
  const script=doc.createElement('script');
  script.defer=true;
  script.src=beaconSource;
  script.setAttribute('data-cf-beacon',JSON.stringify({token:siteToken,spa:false}));
  doc.head.append(script);
 }catch{
  // Optional measurement must never prevent the reader from opening.
 }
}
