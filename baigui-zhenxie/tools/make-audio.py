"""Synthesize the original Wuyin score and effects as mono Vorbis."""
from pathlib import Path
import math
import random
import subprocess
import wave

RATE = 24000
TAU = math.tau
OUTPUT = Path(__file__).resolve().parents[1] / "dist" / "assets"
sine = math.sin

def material(duration, sample, seed):
    rng = random.Random(seed)
    samples = bytearray()
    filt = 0
    for n in range(round(duration * RATE)):
        t = n / RATE
        noise = rng.uniform(-1, 1)
        filt = .87 * filt + .13 * noise
        fade = min(1, t * 400, (duration - t) * 70)
        value = int(max(-1, min(1, fade * sample(t, noise, filt))) * 32767)
        samples.extend(value.to_bytes(2, 'little', signed=True))
    return samples

def encode(name, samples):
    path = OUTPUT / (name + '.wav')
    with wave.open(str(path), 'wb') as handle:
        handle.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        handle.writeframes(samples)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-c:a','libvorbis','-q:a','3',
                    str(OUTPUT/(name+'.ogg'))], check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-c:a','aac','-b:a','48k',
                    str(OUTPUT/(name+'.m4a'))], check=True)
    path.unlink()

def bell(t, freq):
    if t < 0:
        return 0
    a = min(1, t * 170)
    return a * (.66*sine(TAU*freq*t)*math.exp(-3*t)+.29*sine(TAU*freq*2.73*t)*math.exp(-6*t)
                +.19*sine(TAU*freq*4.12*t)*math.exp(-11*t))

def floor(t, n, k):
    return (k*.19 + sine(TAU*(58*t + 11*(1-math.exp(-4*t))))*.45)*math.exp(-6*t)

def wind(t, n, k):
    return (n*.14+k*.57+sine(TAU*(620*t-240*t*t))*.07)*math.exp(-8*t)

def score(t, n, k):
    windbed = k * (.06 + .024*sine(TAU*t/12))
    bass = .07*sine(TAU*48*t + .11*sine(TAU*t/24)) + .029*sine(TAU*71.92*t)
    drone = bass * (.56+.44*sine(TAU*t/12+.9)**2)
    notes = ((.4,192),(1.8,228.4),(3.6,256),(5.1,192),(7.6,287.7),(9,256),(10.2,228.4),
             (12.15,144),(14.3,192),(15.1,228.4),(17.4,256),(18.55,287.7),(20.18,342.1),(21.3,256),(22.1,192))
    melody = sum(bell(t-start,f)*.24 + bell(t-start-.3,f)*.054
                 for start,f in notes if 0 <= t-start < 3.5)
    return drone + melody + windbed

sound_bank = {
    'slash':(.22,lambda t,n,k: wind(t,n,k)*.83),
    'hit':(.17,lambda t,n,k: floor(t,n,k)*.62+n*.19*math.exp(-38*t)),
    'hurt':(.35,lambda t,n,k: floor(t,n,k)*.95+bell(t,117)*.18),
    'dash':(.34,lambda t,n,k: wind(t,n,k)*.87+sine(TAU*(455*t-700*t*t))*.11*math.exp(-10*t)),
    'paper':(.48,lambda t,n,k: n*.2*abs(sine(TAU*26*t))*math.exp(-13*t)+bell(t,402)*.39),
    'ghost':(.68,lambda t,n,k: bell(t,306)*.41+bell(t-.1,381)*.24+wind(t,n,k)*.2),
    'talisman':(.33,lambda t,n,k: bell(t,327)*.37+wind(t,n,k)*.6),
    'fire':(.49,lambda t,n,k: floor(t,n,k)*.8+n*.15*math.exp(-13*t)),
    'thunder':(.58,lambda t,n,k: floor(t,n,k)*.66+n*.35*math.exp(-13*t)+bell(t,153)*.21),
    'array':(.64,lambda t,n,k: bell(t,228)*.34+bell(t-.12,342)*.21+floor(t,n,k)*.2),
    'loot':(.32,lambda t,n,k: bell(t,600)*.32+bell(t-.07,756)*.19),
    'level':(.78,lambda t,n,k: bell(t,381)*.31+bell(t-.10,480)*.27+bell(t-.22,571)*.24),
    'boss':(1.3,lambda t,n,k: floor(t,n,k)*.86+bell(t,64)*.51+bell(t-.28,90)*.33),
    'bossHit':(.52,lambda t,n,k: floor(t,n,k)*.8+wind(t,n,k)*.46),
    'victory':(1.6,lambda t,n,k: sum(bell(t-start,f)*.29 for start,f in ((0,286),(.19,381),(.4,480),(.58,570)))),
    'ambience':(24,score),
}

for i,(name,(duration, sample)) in enumerate(sound_bank.items()):
    encode(name,material(duration,sample,17+i))
