class PrayTime {
    constructor(t) {
        this.methods = {
            MWL: {
                fajr: 18,
                isha: 17
            },
            ISNA: {
                fajr: 15,
                isha: 15
            },
            Egypt: {
                fajr: 19.5,
                isha: 17.5
            },
            Makkah: {
                fajr: 18.5,
                isha: "90 min"
            },
            Karachi: {
                fajr: 18,
                isha: 18
            },
            Tehran: {
                fajr: 17.7,
                maghrib: 4.5,
                midnight: "Jafari"
            },
            Jafari: {
                fajr: 16,
                maghrib: 4,
                midnight: "Jafari"
            },
            France: {
                fajr: 12,
                isha: 12
            },
            Russia: {
                fajr: 16,
                isha: 15
            },
            Singapore: {
                fajr: 20,
                isha: 18
            },
            defaults: {
                isha: 14,
                maghrib: "1 min",
                midnight: "Standard"
            }
        }, this.settings = {
            dhuhr: "0 min",
            asr: "Standard",
            highLats: "NightMiddle",
            tune: {},
            format: "24h",
            rounding: "nearest",
            utcOffset: "auto",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            location: [0, -(new Date).getTimezoneOffset() / 4],
            iterations: 1
        }, this.labels = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Sunset", "Maghrib", "Isha", "Midnight"], this.method(t || "MWL")
    }
    method(t) {
        return this.set(this.methods.defaults).set(this.methods[t])
    }
    adjust(t) {
        return this.set(t)
    }
    location(t) {
        return this.set({
            location: t
        })
    }
    timezone(t) {
        return this.set({
            timezone: t
        })
    }
    tune(t) {
        return this.set({
            tune: t
        })
    }
    round(t = "nearest") {
        return this.set({
            rounding: t
        })
    }
    format(t) {
        return this.set({
            format: t
        })
    }
    set(t) {
        return Object.assign(this.settings, t), this
    }
    utcOffset(t = "auto") {
        return "number" == typeof t && Math.abs(t) < 16 && (t *= 60), this.set({
            timezone: "UTC"
        }), this.set({
            utcOffset: t
        })
    }
    times(t = 0) {
        "number" == typeof t && (t = new Date(t < 1e3 ? Date.now() + 864e5 * t : t)), t.constructor === Date && (t = [t.getFullYear(), t.getMonth() + 1, t.getDate()]), this.utcTime = Date.UTC(t[0], t[1] - 1, t[2]);
        let i = this.computeTimes();
        return this.formatTimes(i), i
    }
    getTimes(t, i, s = "auto", e = 0, a = "24h") {
        if (!i) return this.times(t);
        const n = "auto" == s ? s : s + e;
        return this.location(i).utcOffset(n).format(a), this.times(t)
    }
    setMethod(t) {
        this.method(t)
    }
    computeTimes() {
        let t = {
            fajr: 5,
            sunrise: 6,
            dhuhr: 12,
            asr: 13,
            sunset: 18,
            maghrib: 18,
            isha: 18,
            midnight: 24
        };
        for (let i = 0; i < this.settings.iterations; i++) t = this.processTimes(t);
        return this.adjustHighLats(t), this.updateTimes(t), this.tuneTimes(t), this.convertTimes(t), t
    }
    processTimes(t) {
        const i = this.settings;
        return {
            fajr: this.angleTime(i.fajr, t.fajr, -1),
            sunrise: this.angleTime(.833, t.sunrise, -1),
            dhuhr: this.midDay(t.dhuhr),
            asr: this.angleTime(this.asrAngle(i.asr, t.asr), t.asr),
            sunset: this.angleTime(.833, t.sunset),
            maghrib: this.angleTime(i.maghrib, t.maghrib),
            isha: this.angleTime(i.isha, t.isha),
            midnight: this.midDay(t.midnight) + 12
        }
    }
    updateTimes(t) {
        const i = this.settings;
        if (this.isMin(i.maghrib) && (t.maghrib = t.sunset + this.value(i.maghrib) / 60), this.isMin(i.isha) && (t.isha = t.maghrib + this.value(i.isha) / 60), "Jafari" == i.midnight) {
            const s = this.angleTime(i.fajr, 29, -1) + 24;
            t.midnight = (t.sunset + (this.adjusted ? t.fajr + 24 : s)) / 2
        }
        t.dhuhr += this.value(i.dhuhr) / 60
    }
    tuneTimes(t) {
        const i = this.settings.tune;
        for (let s in t) s in i && (t[s] += i[s] / 60)
    }
    convertTimes(t) {
        const i = this.settings.location[1];
        for (let s in t) {
            const e = t[s] - i / 15,
                a = this.utcTime + Math.floor(36e5 * e);
            t[s] = this.roundTime(a)
        }
    }
    roundTime(t) {
        const i = {
            up: "ceil",
            down: "floor",
            nearest: "round"
        } [this.settings.rounding];
        if (!i) return t;
        return 6e4 * Math[i](t / 6e4)
    }
    sunPosition(t) {
        const i = this.settings.location[1],
            s = this.utcTime / 864e5 - 10957.5 + this.value(t) / 24 - i / 360,
            e = this.mod(357.529 + .98560028 * s, 360),
            a = this.mod(280.459 + .98564736 * s, 360),
            n = this.mod(a + 1.915 * this.sin(e) + .02 * this.sin(2 * e), 360),
            h = 23.439 - 36e-8 * s,
            r = this.mod(this.arctan2(this.cos(h) * this.sin(n), this.cos(n)) / 15, 24);
        return {
            declination: this.arcsin(this.sin(h) * this.sin(n)),
            equation: a / 15 - r
        }
    }
    midDay(t) {
        const i = this.sunPosition(t).equation;
        return this.mod(12 - i, 24)
    }
    angleTime(t, i, s = 1) {
        const e = this.settings.location[0],
            a = this.sunPosition(i).declination,
            n = -this.sin(t) - this.sin(e) * this.sin(a),
            h = this.arccos(n / (this.cos(e) * this.cos(a))) / 15;
        return this.midDay(i) + h * s
    }
    asrAngle(t, i) {
        const s = {
                Standard: 1,
                Hanafi: 2
            } [t] || this.value(t),
            e = this.settings.location[0],
            a = this.sunPosition(i).declination;
        return -this.arccot(s + this.tan(Math.abs(e - a)))
    }
    adjustHighLats(t) {
        const i = this.settings;
        if ("None" == i.highLats) return;
        this.adjusted = !1;
        const s = 24 + t.sunrise - t.sunset;
        Object.assign(t, {
            fajr: this.adjustTime(t.fajr, t.sunrise, i.fajr, s, -1),
            isha: this.adjustTime(t.isha, t.sunset, i.isha, s),
            maghrib: this.adjustTime(t.maghrib, t.sunset, i.maghrib, s)
        })
    }
    adjustTime(t, i, s, e, a = 1) {
        const n = {
                NightMiddle: .5,
                OneSeventh: 1 / 7,
                AngleBased: 1 / 60 * this.value(s)
            } [this.settings.highLats] * e,
            h = (t - i) * a;
        return (isNaN(t) || h > n) && (t = i + n * a, this.adjusted = !0), t
    }
    formatTimes(t) {
        for (let i in t) t[i] = this.formatTime(t[i])
    }
    formatTime(t) {
        const i = this.settings.format;
        return isNaN(t) ? "-----" : "function" == typeof i ? i(t) : "x" == i.toLowerCase() ? Math.floor(t / ("X" == i ? 1e3 : 1)) : this.timeToString(t, i)
    }
    timeToString(t, i) {
        const s = this.settings.utcOffset,
            e = new Date(t + 6e4 * ("auto" == s ? 0 : s)).toLocaleTimeString("en-US", {
                timeZone: this.settings.timezone,
                hour12: "24h" != i,
                hour: "24h" == i ? "2-digit" : "numeric",
                minute: "2-digit"
            });
        return "12H" == i ? e.replace(/ ?[AP]M/, "") : e
    }
    value(t) {
        return +String(t).split(/[^0-9.+-]/)[0]
    }
    isMin(t) {
        return -1 != String(t).indexOf("min")
    }
    mod(t, i) {
        return (t % i + i) % i
    }
    dtr = t => t * Math.PI / 180;
    rtd = t => 180 * t / Math.PI;
    sin = t => Math.sin(this.dtr(t));
    cos = t => Math.cos(this.dtr(t));
    tan = t => Math.tan(this.dtr(t));
    arcsin = t => this.rtd(Math.asin(t));
    arccos = t => this.rtd(Math.acos(t));
    arctan = t => this.rtd(Math.atan(t));
    arccot = t => this.rtd(Math.atan(1 / t));
    arctan2 = (t, i) => this.rtd(Math.atan2(t, i))
}
"undefined" != typeof module && module.exports && (module.exports = {
    PrayTime: PrayTime
});