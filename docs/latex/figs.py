import json, glob, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt, matplotlib.font_manager as fm
from matplotlib.patches import Ellipse, Circle, FancyArrowPatch, Wedge
for p in glob.glob('/usr/share/texmf/fonts/opentype/public/lm/lmroman10-*.otf'): fm.fontManager.addfont(p)
plt.rcParams.update({'font.family':['Latin Modern Roman','DejaVu Serif'],'font.size':10.5,'axes.titlesize':11,'pdf.fonttype':3,'axes.edgecolor':'#9AA39C','axes.labelcolor':'#3B4540',
 'xtick.color':'#56635B','ytick.color':'#56635B','axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'path','axes.titleweight':'normal'})
INK='#18221D'; MUT='#56635B'; BLUE='#2A78D6'; ORG='#D9480F'; GRID='#E3E8DA'; AQUA='#1BAF7A'
eta,sig,h,P0=2.5,4,100,-40
k=(10*eta/(sig*np.log(10)))**2
def save(f,name): f.savefig('fig/'+name+'.pdf',bbox_inches='tight',pad_inches=0.04); plt.close(f)

# 1. sinal x distância
r=np.linspace(0,800,400); d=np.sqrt(r**2+h**2); y=P0-10*eta*np.log10(d)
f,ax=plt.subplots(figsize=(6.4,2.9))
ax.fill_between(r,y-sig,y+sig,color=BLUE,alpha=.13,lw=0,label='faixa do ruído (±4 dB)')
ax.plot(r,y,color=BLUE,lw=2,label='sinal médio')
for r0,txt,dx in [(150,'Perto: andar 50 m muda\no sinal em ~2 dB',30),(600,'Longe: andar 50 m muda\no sinal em ~0,8 dB',-20)]:
    y0=P0-10*eta*np.log10(np.hypot(r0,h)); y1=P0-10*eta*np.log10(np.hypot(r0+50,h))
    ax.plot([r0,r0+50],[y0,y1],color=ORG,lw=3,solid_capstyle='round')
    ax.annotate(txt,(r0+25,(y0+y1)/2),xytext=(r0+dx+60,(y0+y1)/2+6),fontsize=9,color=INK,arrowprops=dict(arrowstyle='-',color=MUT,lw=.8))
ax.set_xlabel('distância horizontal entre drone e pessoa (m)'); ax.set_ylabel('sinal medido (dBm)')
ax.legend(frameon=False,fontsize=9,loc='lower left'); ax.grid(color=GRID,lw=.8); ax.set_xlim(0,800)
save(f,'sinal')

# 2. informação x distância horizontal
r=np.linspace(0,500,500); I=r**2/(r**2+h**2)**2; I=I/I.max()
f,ax=plt.subplots(figsize=(6.4,2.6))
ax.plot(r,I,color=BLUE,lw=2); ax.fill_between(r,0,I,color=BLUE,alpha=.08)
ax.axvline(h,color=ORG,lw=1.2,ls='--'); ax.plot([h],[1],'o',color=ORG,ms=7)
ax.annotate('melhor distância:\nigual à altitude (100 m)',(h,1),xytext=(h+120,.97),fontsize=9,color=INK,arrowprops=dict(arrowstyle='-',color=MUT,lw=.8))
ax.annotate('bem em cima da pessoa:\nquase nenhuma informação',(4,.02),xytext=(125,.2),fontsize=9,color=INK,arrowprops=dict(arrowstyle='-',color=MUT,lw=.8))
ax.annotate('longe: a informação\ncai rapidamente',(380,I[380]),xytext=(300,.55),fontsize=9,color=INK,arrowprops=dict(arrowstyle='-',color=MUT,lw=.8))
ax.set_xlabel('distância horizontal entre drone e pessoa (m), com o drone a 100 m de altura'); ax.set_ylabel('informação (relativa)')
ax.set_ylim(0,1.12); ax.set_xlim(0,500); ax.grid(color=GRID,lw=.8)
save(f,'info_r')

# 3. vista lateral: por que em cima não serve
f,axs=plt.subplots(1,2,figsize=(6.6,2.5))
for ax,(dx,title) in zip(axs,[(0,'Drone bem em cima da pessoa'),(100,'Drone afastado 100 m')]):
    ax.set_aspect('equal'); ax.axis('off'); ax.set_xlim(-60,170); ax.set_ylim(-25,125)
    ax.plot([-60,170],[0,0],color=MUT,lw=1)
    D=( -dx,100) # drone position relative to person (person at 0)
    ax.plot(*D,marker='s',color=BLUE,ms=9)
    ax.text(D[0],D[1]+9,'drone',ha='center',fontsize=9,color=INK)
    for px,c,lab in [(0,ORG,'antes'),(35,ORG,'depois')]:
        ax.plot(px,0,'o',color=c,ms=7,alpha=1 if px==0 else .45)
        ax.plot([D[0],px],[D[1],0],color=c,lw=1.4,alpha=1 if px==0 else .45,ls='-' if px==0 else '--')
    d0=np.hypot(D[0],D[1]); d1=np.hypot(D[0]-35,D[1])
    ax.annotate('',xy=(35,-12),xytext=(0,-12),arrowprops=dict(arrowstyle='->',color=INK,lw=1))
    ax.text(17,-24,'pessoa anda 35 m',ha='center',fontsize=8.5,color=MUT)
    ax.text(85 if dx==0 else 60,60,f'distância muda\n{d1-d0:+.0f} m',fontsize=9.5,color=INK,ha='left')
    ax.set_title(title,fontsize=10,color=INK)
    if dx: ax.set_xlim(-130,110)
save(f,'altitude')

# helpers Fisher
def F_of(p,qs,n=10):
    F=np.eye(2)/1e6
    for q in qs:
        v=np.array(p)-np.array(q); D=v@v+h*h; F+=n*k*np.outer(v,v)/D**2
    return F
def ell(ax,F,p,col=ORG,scale=1):
    C=np.linalg.inv(F); w,V=np.linalg.eigh(C); ang=np.degrees(np.arctan2(V[1,1],V[0,1]))
    a,b=2*np.sqrt(5.991*w[1]),2*np.sqrt(5.991*w[0])
    ax.add_patch(Ellipse(p,a*scale,b*scale,angle=ang,fc=col,alpha=.18,ec=col,lw=1.6)); return np.pi*np.sqrt(5.991*w[0])*np.sqrt(5.991*w[1])

# 4. anéis: 1 drone, 2 alinhados, 2 em ângulo reto
f,axs=plt.subplots(1,3,figsize=(6.8,2.5))
P=np.array([0,0])
cfgs=[('Um drone',[(-110,-40)]),('Dois drones na mesma direção',[(-110,-40),(-170,-62)]),('Dois drones em ângulo reto',[(-110,-40),(40,-110)])]
for ax,(t,qs) in zip(axs,cfgs):
    ax.set_aspect('equal'); ax.axis('off'); ax.set_xlim(-390,200); ax.set_ylim(-300,290)
    for q in qs:
        R=np.hypot(*(P-np.array(q)))
        ax.add_patch(Wedge(q,R+22,0,360,width=44,fc=BLUE,alpha=.16,ec='none'))
        ax.plot(*q,marker='s',color=BLUE,ms=7)
    ax.plot(*P,'o',color=ORG,ms=6)
    ax.set_title(t,fontsize=9.5,color=INK)
save(f,'aneis')

# 5. elipses para 3 arranjos de 4 drones
f,axs=plt.subplots(1,3,figsize=(6.8,2.6))
P=np.array([0.,0.]); r=100
def at(angs): return [(r*np.cos(np.radians(a)),r*np.sin(np.radians(a))) for a in angs]
arrs=[('Todos do mesmo lado',at([170,180,190,200])),('Em semicírculo, a 45°',at([90,135,180,225])),('Em cruz',at([0,90,180,270]))]
for ax,(t,qs) in zip(axs,arrs):
    ax.set_aspect('equal'); ax.axis('off'); lim=170; ax.set_xlim(-lim,lim); ax.set_ylim(-lim,lim)
    F=F_of(P,qs); A=ell(ax,F,P,scale=1)
    ax.add_patch(Circle(P,r,fc='none',ec=MUT,ls=':',lw=1))
    for q in qs: ax.plot(*q,marker='s',color=BLUE,ms=7); ax.plot([q[0],0],[q[1],0],color=BLUE,lw=.7,alpha=.5)
    ax.plot(0,0,'o',color=ORG,ms=5)
    ax.set_title(t,fontsize=9.5,color=INK); ax.text(0,-lim+8,f'área da elipse: {A:,.0f} m²'.replace(',','.'),ha='center',fontsize=9,color=INK)
save(f,'elipses')

# 6. paisagem: quanto vale colocar o 4º drone em cada lugar (3 drones fixos)
fixed=at([180,0])
xs=np.linspace(-300,300,241); X,Y=np.meshgrid(xs,xs); Z=np.zeros_like(X)
for i in range(X.shape[0]):
    for j in range(X.shape[1]):
        Z[i,j]=np.log(np.linalg.det(F_of(P,fixed+[(X[i,j],Y[i,j])])))
Z-=Z.min()
f,ax=plt.subplots(figsize=(4.2,3.6))
cs=ax.contourf(X,Y,Z,levels=14,cmap='Blues'); ax.contour(X,Y,Z,levels=14,colors='white',linewidths=.4)
for q in fixed: ax.plot(*q,marker='s',color=INK,ms=7)
ax.plot(0,0,'o',color=ORG,ms=7,mec='white')
# caminho de subida pelo gradiente numérico
p=np.array([-260.,240.]); path=[p.copy()]
def J(q): return np.log(np.linalg.det(F_of(P,fixed+[tuple(q)])))
for it in range(400):
    g=np.array([(J(p+[1e-2,0])-J(p-[1e-2,0]))/2e-2,(J(p+[0,1e-2])-J(p-[0,1e-2]))/2e-2])
    s=g/np.linalg.norm(g)*min(12,np.linalg.norm(g)*4e4); p=p+s; path.append(p.copy())
    if np.linalg.norm(s)<.05: break
path=np.array(path); ax.plot(path[:,0],path[:,1],color=ORG,lw=2); ax.plot(*path[0],'o',color=ORG,ms=5); ax.plot(*path[-1],'*',color=ORG,ms=13,mec='white')
ax.text(path[0,0]-5,path[0,1]+18,'início',fontsize=9,color=INK)
ax.set_aspect('equal'); ax.set_xticks([]); ax.set_yticks([])
for s_ in ax.spines.values(): s_.set_visible(False)
save(f,'paisagem')

# 7. tamanho do passo
xx=np.linspace(-1,5,300); fx=-(xx-2)**2+4
f,axs=plt.subplots(1,2,figsize=(6.6,2.4),sharey=True)
for ax,(t,pts) in zip(axs,[('Passo grande demais: pula o topo',[-0.4,4.6,-0.9,5.0]),('Passo ajustado: sobe e para no topo',[-0.4,0.8,1.5,1.85,1.97])]):
    ax.plot(xx,fx,color=BLUE,lw=2); P_=[(x,-(x-2)**2+4) for x in pts]
    for a,b in zip(P_[:-1],P_[1:]): ax.annotate('',xy=b,xytext=a,arrowprops=dict(arrowstyle='->',color=ORG,lw=1.4,connectionstyle='arc3,rad=-0.25'))
    for x,y in P_: ax.plot(x,y,'o',color=ORG,ms=5)
    ax.set_title(t,fontsize=9.5,color=INK); ax.set_xticks([]); ax.set_yticks([]); ax.set_ylim(-6,5.5)
    ax.set_xlabel('posição do drone'); 
axs[0].set_ylabel('informação')
save(f,'passo')

# 8. resultados
mc=json.load(open('mc.json')); rr=np.arange(1,13)
f,axs=plt.subplots(1,2,figsize=(6.8,2.9))
ax=axs[0]
for key,lab,c,ls in [('fisher','Maximizar Fisher',ORG,'-'),('goto','Voar até a estimativa',BLUE,'--'),('random','Voo aleatório',AQUA,':')]:
    ax.plot(rr,mc['strat'][key]['med'],color=c,ls=ls,lw=2,label=lab)
ax.set_title('Estratégias (4 drones)',fontsize=10,color=INK)
ax2=axs[1]
for N,c,ls in [('2',BLUE,'-'),('4',AQUA,':'),('6','#EDA100','-.'),('8','#E87BA4','-')]:
    ax2.plot(rr,mc['qty'][N]['med'],color=c,ls=ls,lw=2,label=f'{N} drones')
ax2.set_title('Quantidade de drones (estratégia de Fisher)',fontsize=10,color=INK)
for a in axs:
    a.set_yscale('log'); a.set_yticks([10,25,50,100,200,400]); a.set_yticklabels(['10','25','50','100','200','400'])
    a.axhline(25,color=MUT,ls='--',lw=.8); a.grid(color=GRID,lw=.8); a.set_xlabel('rodada'); a.legend(frameon=False,fontsize=8.5); a.set_xticks([1,3,6,9,12])
axs[0].set_ylabel('erro mediano (m)')
plt.tight_layout(); save(f,'resultados')
print('ok')
