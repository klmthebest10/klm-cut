//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

func openApp(url string) *exec.Cmd {
	for _, b := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(b); err == nil {
			cmd := exec.Command(p, "--app="+url, "--no-first-run")
			if cmd.Start() == nil {
				return cmd
			}
		}
	}
	opener := "xdg-open"
	if runtime.GOOS == "darwin" {
		opener = "open"
	}
	exec.Command(opener, url).Start()
	return nil
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
