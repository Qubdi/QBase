import json,glob,re,os,sys
D=os.environ['TRANSCRIPTS']+'/'
# the paths a session may touch: this checkout (REPO, default the current folder), the temporary
# folder, the clean-room copy and the tool's own folder under the home directory
HOME=os.path.expanduser('~')
REPO=os.environ.get('REPO',os.getcwd()).rstrip('/')
ALLOWED=(REPO+'/','/tmp/',HOME+'/clean-room/',HOME+'/.claude/')
MAIN=re.compile(r'(git\s+(-C\s+\S+\s+)?(show|diff|log|checkout|switch|cat-file|ls-tree|archive|worktree|restore|grep|rev-parse|branch|merge-base|blame)\b[^\n|;&]*\b(main|origin/main)\b)|(\bmain:)|QBase-main',re.I)
CHART=re.compile(r'chartdb|ee95448',re.I)
rows=[]
for f in sorted(glob.glob(D+'agent-*.jsonl')):
    aid=os.path.basename(f)[6:-6]
    task='';tools=0;flags=[];first_ts=None;outside=set()
    for line in open(f):
        try: o=json.loads(line)
        except: continue
        ts=o.get('timestamp')
        if ts and not first_ts: first_ts=ts
        m=o.get('message') or {}
        c=m.get('content')
        if o.get('type')=='user' and not task and isinstance(c,str): task=c[:110].replace('\n',' ')
        if isinstance(c,list):
            for it in c:
                if it.get('type')=='tool_use':
                    tools+=1
                    inp=it.get('input',{}); s=json.dumps(inp)
                    name=it['name']
                    if MAIN.search(s): flags.append(('main',name,s[:160]))
                    if CHART.search(s): flags.append(('chartdb',name,s[:160]))
                    for k in ('file_path','path','notebook_path'):
                        v=inp.get(k)
                        if isinstance(v,str) and v.startswith('/') and not v.startswith(ALLOWED): outside.add(v[:100])
    rows.append((first_ts or '',aid,task,tools,flags,sorted(outside)))
rows.sort()

for ts,aid,task,tools,flags,outside in rows:
    print(ts[:16],aid[:8],str(tools).rjust(4),'FLAGS=%d'%len(flags),'OUT=%d'%len(outside),'|',task[:80])
