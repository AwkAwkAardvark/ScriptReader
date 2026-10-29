import type { AnchorHTMLAttributes } from 'react';

export function ExternalLinkIcon() {
 return <svg className="admin-external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>;
}
export function AdminActionLink({children,className='',...props}:AnchorHTMLAttributes<HTMLAnchorElement>) {
 return <a {...props} className={`admin-action-link ${className}`.trim()}>{children}{props.target==='_blank'&&<ExternalLinkIcon/>}</a>;
}
