# Add to ~/.bashrc:
#   source /home/pms/ams-deploy/ams-aliases.sh
ams() {
  if [[ $# -eq 0 ]]; then
    make -f /home/pms/ams-deploy/Makefile help
  else
    make -f /home/pms/ams-deploy/Makefile "$@"
  fi
}
