// KLM Cut — peluncur desktop.
// Menyajikan aplikasi web (tertanam di dalam .exe) di 127.0.0.1 lalu membukanya
// sebagai jendela aplikasi (Microsoft Edge / Google Chrome mode --app).
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed all:web
var webFS embed.FS

const defaultPort = 47830

var (
	lastPing atomic.Int64
	pendMu   sync.Mutex
	pending  []string
)

func addPending(paths []string) {
	pendMu.Lock()
	defer pendMu.Unlock()
	for _, p := range paths {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			abs, _ := filepath.Abs(p)
			pending = append(pending, abs)
		}
	}
}

func isOurServer(base string) bool {
	c := http.Client{Timeout: 700 * time.Millisecond}
	r, err := c.Get(base + "__klmcut")
	if err != nil {
		return false
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(r.Body)
	return strings.TrimSpace(string(b)) == "klmcut"
}

func sendToRunning(base string, files []string) {
	if len(files) == 0 {
		return
	}
	b, _ := json.Marshal(files)
	c := http.Client{Timeout: 2 * time.Second}
	r, err := c.Post(base+"__queue", "application/json", strings.NewReader(string(b)))
	if err == nil {
		r.Body.Close()
	}
}

func main() {
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	_ = mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		fatal("Data aplikasi rusak: " + err.Error())
	}
	files := os.Args[1:]
	base := fmt.Sprintf("http://127.0.0.1:%d/", defaultPort)

	// sudah berjalan? cukup buka jendela baru / kirim file
	if isOurServer(base) {
		sendToRunning(base, files)
		openApp(base)
		return
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", defaultPort))
	if err != nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fatal("Tidak bisa membuka server lokal: " + err.Error())
		}
		base = "http://" + ln.Addr().String() + "/"
	}
	addPending(files)

	mux := http.NewServeMux()
	static := http.FileServer(http.FS(sub))
	mux.HandleFunc("/__klmcut", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, "klmcut")
	})
	mux.HandleFunc("/__ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().Unix())
		pendMu.Lock()
		n := len(pending)
		pendMu.Unlock()
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"pending":%d}`, n)
	})
	mux.HandleFunc("/__queue", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		var list []string
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&list); err == nil {
			addPending(list)
		}
		io.WriteString(w, "ok")
	})
	mux.HandleFunc("/__pending", func(w http.ResponseWriter, r *http.Request) {
		pendMu.Lock()
		type item struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		}
		out := []item{}
		for i, p := range pending {
			out = append(out, item{Name: filepath.Base(p), URL: fmt.Sprintf("__file/%d", i)})
		}
		pendMu.Unlock()
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	})
	mux.HandleFunc("/__file/", func(w http.ResponseWriter, r *http.Request) {
		var i int
		if _, err := fmt.Sscanf(strings.TrimPrefix(r.URL.Path, "/__file/"), "%d", &i); err != nil {
			http.NotFound(w, r)
			return
		}
		pendMu.Lock()
		if i < 0 || i >= len(pending) {
			pendMu.Unlock()
			http.NotFound(w, r)
			return
		}
		p := pending[i]
		pendMu.Unlock()
		f, err := os.Open(p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		st, _ := f.Stat()
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, filepath.Base(p), st.ModTime(), f)
	})
	mux.HandleFunc("/__done", func(w http.ResponseWriter, r *http.Request) {
		pendMu.Lock()
		pending = nil
		pendMu.Unlock()
		io.WriteString(w, "ok")
	})
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/sw.js" || strings.HasSuffix(r.URL.Path, ".html") || r.URL.Path == "/" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		static.ServeHTTP(w, r)
	}))
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go srv.Serve(ln)

	if os.Getenv("KLMCUT_NO_BROWSER") != "" {
		fmt.Println("KLM Cut berjalan di", base)
		select {}
	}
	proc := openApp(base)
	lastPing.Store(time.Now().Unix() + 60) // beri waktu jendela dimuat
	var done chan struct{}
	if proc != nil {
		done = make(chan struct{})
		go func() { proc.Wait(); close(done) }()
	}
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-done:
			done = nil
			// jendela ditutup: tunggu sebentar, mungkin diserahkan ke proses browser lain
			time.Sleep(8 * time.Second)
			if time.Now().Unix()-lastPing.Load() > 12 {
				return
			}
		case <-tick.C:
			if time.Now().Unix()-lastPing.Load() > 150 {
				return
			}
		}
	}
}
