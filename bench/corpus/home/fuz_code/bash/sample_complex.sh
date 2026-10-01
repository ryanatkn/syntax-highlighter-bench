#!/bin/bash

# This is a comment
name="world"
readonly PI=3.14
local_var='single quoted'
ansi_string=$'tab\there\nnewline'

# Special variables
echo $0 $1 $@ $# $? $$ $!

# Parameter expansion
echo ${name}
echo ${name:-default}
echo ${#name}

# Arrays
arr=(one two three)
echo ${arr[0]}
echo ${arr[@]}
echo ${#arr[@]}
arr+=(four)

# Associative arrays
declare -A map
map[key]="value"
echo ${map[key]}
echo ${!map[@]}

# Control flow
if [ -f "$name" ]; then
	echo "file exists"
elif [[ $name == "world" ]]; then
	echo "hello world"
else
	echo "something else"
fi

# Regex match in [[
if [[ $name =~ ^[a-z]+$ ]]; then
	echo "lowercase"
fi

# Loops
for i in 1 2 3; do
	echo $i
done

for ((i = 0; i < 10; i++)); do
	echo $i
done

while read -r line; do
	echo "$line"
done < input.txt

until false; do
	break
done

# Select menu
select opt in "Option 1" "Option 2" "Quit"; do
	case $opt in
		Quit) break ;;
		*) echo "You chose $opt" ;;
	esac
done

# Case statement
case "$name" in
	hello)
		echo "hi"
		;;
	world|earth)
		echo "globe"
		;;
	*)
		echo "unknown"
		;;
esac

# Functions
greet() {
	local greeting="Hello"
	echo "$greeting, $1!"
	return 0
}

function cleanup {
	echo "cleaning up"
}

# Command substitution
today=$(date +%Y-%m-%d)
files=$(ls -la | grep "\.txt$")
legacy=`echo "$today"`

# Arithmetic expansion
result=$(( 2 + 3 * 4 ))
(( count++ ))
(( x = y > 0 ? y : -y ))

# Here-document
cat <<EOF
Hello, ${name}!
Today is $(date).
single
word
lines
EOF

cat <<-'NOEXPAND'
	No $variable expansion here.
	Tabs are stripped with <<-
NOEXPAND

cat <<"QUOTED"
Also no $expansion here.
QUOTED

# Here-string
read -r first_word <<< "hello world"

# Process substitution
diff <(sort file1.txt) <(sort file2.txt)
tee >(grep error > errors.log) >(grep warn > warns.log)

# Operators and redirections
echo "output" > file.txt
echo "append" >> file.txt
cat < input.txt
cmd 2>&1
cmd &>/dev/null
cmd 2>/dev/null

# Pipeline
ls -la | sort | head -5

# Logical operators
true && echo "success" || echo "failure"
! false && echo "negated"

# Inline comment
echo "hello" # after code

# Subshells and grouping
(cd /tmp && ls -la)
{ echo "grouped"; echo "commands"; }

# Nested quotes and escaping
echo "it's a \"test\""
echo "path is: $HOME/dir"
echo 'no $expansion here'
echo "nested $(echo "inner $(echo deep)")"

# Multiline with backslash
command --flag1 \
	--flag2 \
	--flag3

# Builtins
export PATH="/usr/local/bin:$PATH"
cd /tmp
pwd
source ~/.bashrc
eval "echo hello"
exec bash
test -d /tmp
set -euo pipefail
trap 'cleanup' EXIT INT TERM
declare -a array
declare -A assoc_array
shift 2
command ls
hash -r
type ls
ulimit -n 1024
umask 022
wait $!
jobs -l
bg %1
fg %1
disown %1
shopt -s globstar

# Numbers
hex=0xFF
octal=077
binary=2#1010
decimal=42
