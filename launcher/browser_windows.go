//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

func findBrowser() string {
	env := func(k string) string { return os.Getenv(k) }
	cands := []string{
		filepath.Join(env("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(env("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(env("LocalAppData"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(env("ProgramFiles"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(env("ProgramFiles(x86)"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(env("LocalAppData"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(env("ProgramFiles"), `BraveSoftware\Brave-Browser\Application\brave.exe`),
	}
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

func openApp(url string) *exec.Cmd {
	b := findBrowser()
	if b == "" {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		return nil
	}
	prof := filepath.Join(os.Getenv("LocalAppData"), "KLMCut", "Browser")
	os.MkdirAll(prof, 0o755)
	cmd := exec.Command(b,
		"--app="+url,
		"--user-data-dir="+prof,
		"--no-first-run",
		"--no-default-browser-check",
		"--window-size=1400,880",
		"--autoplay-policy=no-user-gesture-required",
		"--disable-features=Translate,msEdgeSidebar",
	)
	if err := cmd.Start(); err != nil {
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
		return nil
	}
	return cmd
}

func fatal(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	mb := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString("KLM Cut")
	m, _ := syscall.UTF16PtrFromString(msg)
	mb.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
	os.Exit(1)
}
